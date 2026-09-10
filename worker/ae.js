// PV-Link 不良反應個案（AE）收案 API — Cloudflare Worker 端。
//
// 端點（全部掛在 /api/ae-reports 之下，並由 index.js 先驗過 Cloudflare Access JWT）：
//   GET    /api/ae-reports                          列出個案（不含附件本體）
//   POST   /api/ae-reports                          送出／覆寫個案（業務通報、追蹤報告）
//   GET    /api/ae-reports/:id                      取單一個案（含稽核軌跡）
//   PATCH  /api/ae-reports/:id                      後台判定更新
//   DELETE /api/ae-reports/:id                      軟刪除（標記作廢，軌跡永遠留著）
//   GET    /api/ae-reports/:id/attachments/:attId   取附件本體（R2）
//   GET    /api/me                                  目前登入者的 email、角色與個人檔案
//   PUT    /api/me                                  更新自己的個人檔案（不含角色）
//
// 貫穿全檔的三條規則：
//   1. **actor 一律取自已驗證的 Access JWT，永不採信請求內容。** 前端送來的
//      auditTrail[].actor 一概忽略並改寫。稽核軌跡若能被前端自報身分，就等於沒有軌跡。
//   2. **個案不做實體刪除。** DELETE 只寫 deleted_at；稽核軌跡表另有資料庫層 trigger
//      擋掉任何 UPDATE / DELETE。
//   3. **分權在這裡執行，不在前端。** 業務（rep）只讀得到自己送的個案，
//      藥安人員（pv）讀寫全部。前端的頁面切換只是體驗，不是防線——
//      任何人都能直接打 API，所以每一條路由都自己檢查角色。

const MAH_SERIOUS_REPORT_DAYS = 15;

// ── 由 payload 推導索引欄位 ─────────────────────────────────────────────
//
// ⚠️ 這裡的嚴重性與到期日規則是 services/aeReport.ts 的鏡像，用途僅為建立
// 查詢／排序索引（個案本體以 payload 為準，前端顯示時會自行重算）。
// 兩邊若漂移，收件匣的時限排序就會失準——tests/worker.test.ts 有交叉比對測試，
// 規則改了而這裡沒跟上，測試會直接失敗。
export function deriveSerious(report) {
  const override = report?.triage?.seriousnessOverride;
  if (override === 'serious') return true;
  if (override === 'non_serious') return false;
  return (report?.events || []).some(
    (e) => Array.isArray(e?.seriousnessCriteria) && e.seriousnessCriteria.length > 0
  );
}

/** 以 UTC 解析 YYYY-MM-DD；格式不符或日期溢位（如 2026-02-30）回 null。 */
export function parseIsoDate(s) {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export function addDays(iso, days) {
  const dt = parseIsoDate(iso);
  if (!dt) return null;
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** 法定到期日；無快速通報義務時回 null（非嚴重、缺 Day 0、未帶新資訊的追蹤報告）。 */
export function deriveDueDate(report) {
  if (!deriveSerious(report)) return null;
  if (report?.reportType === 'follow_up' && !report?.hasSignificantNewInfo) return null;
  return addDays(report?.awarenessDate, MAH_SERIOUS_REPORT_DAYS);
}

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** 從個案 payload 取出要落成資料行的索引欄位。 */
export function indexColumns(report) {
  const suspect = (report?.drugs || []).find((d) => d?.isSuspect) || {};
  return {
    case_number: str(report?.caseNumber),
    status: str(report?.status) || 'submitted',
    report_type: report?.reportType === 'follow_up' ? 'follow_up' : 'initial',
    follow_up_of_id: str(report?.followUpOfId) || null,
    awareness_date: str(report?.awarenessDate) || null,
    due_date: deriveDueDate(report),
    serious: deriveSerious(report) ? 1 : 0,
    country: str(report?.country) || null,
    suspect_drug: str(suspect.brandName || suspect.activeIngredient) || null,
    patient_key: str(report?.patientInitials || report?.patientId).toLowerCase().trim() || null,
  };
}

// ── 角色與權限 ──────────────────────────────────────────────────────────
//
// 這一段刻意全是純函式（唯一的 I/O 是 resolveRole 查表），
// 好讓權限規則能被單元測試逐條驗證，而不是只能靠部署後手動點點看。

/** email 比對一律小寫去空白：JWT 的大小寫不保證與資料表一致。 */
export const normalizeEmail = (v) => str(v).trim().toLowerCase();

/**
 * 正規化角色。**任何無法辨識的值都降級為 rep**——包含 null、空字串、拼錯的字串。
 * 這個預設值是刻意選的：設定漏了會讓人「看不到全部個案」（會有人來反映），
 * 而不是「看得到全部個案」（沒人會來反映）。
 */
export const normalizeRole = (v) => (str(v).trim().toLowerCase() === 'pv' ? 'pv' : 'rep');

/**
 * 開機用的藥安人員清單（環境變數 AE_PV_EMAILS，逗號分隔）。
 *
 * 為什麼需要它：ae_users 一開始是空的，若只認資料表，第一個藥安人員永遠設不進去
 * ——沒有人有權限去新增第一個有權限的人。這是典型的開機死結。
 * 請用 `wrangler secret put AE_PV_EMAILS` 設定，別寫進 wrangler.toml（那會進 git）。
 */
export function bootstrapRole(email, listRaw) {
  const target = normalizeEmail(email);
  if (!target) return null;
  const list = str(listRaw).split(',').map(normalizeEmail).filter(Boolean);
  return list.includes(target) ? 'pv' : null;
}

/**
 * rep 只看得到自己送的個案；pv 看全部。
 *
 * 兩邊都必須是非空字串才算相符：否則「沒有 actor」對上「沒有 submitted_by」
 * 會因為 '' === '' 而放行。路由層雖已擋掉空 actor，但這個函式是獨立可測的
 * 權限判斷，不該把安全性押在呼叫端記得先檢查。
 */
export function canReadCase(role, actor, row) {
  if (role === 'pv') return true;
  if (!row) return false;
  const owner = normalizeEmail(row.submitted_by);
  const me = normalizeEmail(actor);
  return Boolean(owner) && Boolean(me) && owner === me;
}

/**
 * rep 是否可以覆寫一筆已存在的個案。
 *
 * 放行的唯一情境是「自己送的、而且藥安還沒動過」：離線 outbox 補送時，
 * 前一次 POST 可能其實已經寫進去只是回應沒收到，重送必須成功而非報錯。
 * 一旦藥安開始處理（狀態離開 draft/submitted），通報者就不能再覆寫——
 * 否則業務按一下重送，就把藥安的判定與編碼整份洗掉。
 */
export function canRepOverwrite(actor, row) {
  if (!row) return true; // 新個案
  const owner = normalizeEmail(row.submitted_by);
  const me = normalizeEmail(actor);
  if (!owner || !me || owner !== me) return false;   // 同上：空字串不算相符
  return row.status === 'submitted' || row.status === 'draft';
}

// ── 通報者個人檔案 ──────────────────────────────────────────────────────
//
// CIOMS 表格裡「誰通報的」那一段，對同一位業務每次都一樣。存在個案裡，
// 等於每通報一次就要重打六個欄位——手機上這是第一屏就讓人放棄的主因。
// 改為首次登入建檔一次，之後由前端自動帶入。
//
// ⚠️ 這是**顯示用**資料，不是身分憑證。「誰送的」永遠以 ae_cases.submitted_by
// （取自 Access JWT）為準；使用者把這裡的姓名改成同事的名字，也動不了那個欄位。

/**
 * 允許使用者自行修改的欄位。**白名單而非黑名單**：
 * 用黑名單的話，日後資料表新增敏感欄位（例如 role）而有人忘了加進排除清單，
 * 就會變成使用者可以自己升級成藥安人員。白名單漏掉的後果只是「某欄位改不了」。
 */
export const PROFILE_FIELDS = ['display_name', 'employee_id', 'phone', 'contact_email', 'org', 'territory'];

/** 從請求內容挑出可寫欄位並修剪空白；未提供的欄位回傳 undefined（代表不更動）。 */
export function sanitizeProfile(input) {
  const out = {};
  for (const key of PROFILE_FIELDS) {
    if (input && Object.prototype.hasOwnProperty.call(input, key)) {
      out[key] = str(input[key]).trim().slice(0, 200);
    }
  }
  return out;
}

/**
 * 檔案是否算完成。
 *
 * 只認姓名與電話兩項，因為這正是 validateAEReport 對通報者的硬性要求
 * （四要素之一「可辨識的通報者」＋至少一個聯絡方式）。門檻訂得比驗證規則高，
 * 只會擋住一個其實可以送出通報的人——業務在客戶端遇到不良反應時，
 * 讓他填不完的資料卡住通報，比少一個轄區欄位嚴重得多。
 */
export function isProfileComplete(row) {
  return Boolean(str(row?.display_name).trim()) && Boolean(str(row?.phone).trim());
}

/** 資料列 → 前端要的檔案物件。查無此人時回傳空白檔案，不是 null。 */
export function rowToProfile(row, defaults = {}) {
  return {
    displayName: str(row?.display_name),
    employeeId: str(row?.employee_id),
    phone: str(row?.phone),
    contactEmail: str(row?.contact_email),
    // 公司名稱對全公司都一樣，可由環境變數預設，省下每個人打一次也少一種打錯的方式
    org: str(row?.org) || str(defaults.org),
    territory: str(row?.territory),
  };
}

async function loadUserRow(env, email) {
  try {
    return await env.DB.prepare(`SELECT * FROM ae_users WHERE email = ?`).bind(normalizeEmail(email)).first();
  } catch (e) {
    console.log('loadUserRow failed:', e?.message || e);
    return null;
  }
}

/**
 * 寫入個人檔案。角色**不在**可寫欄位內：既有使用者沿用原角色，
 * 新使用者一律建為 rep。使用者自己建檔永遠不可能建出一個藥安人員。
 */
async function saveProfile(env, email, patch) {
  const key = normalizeEmail(email);
  const now = new Date().toISOString();
  const existing = await loadUserRow(env, key);
  const merged = { ...(existing || {}), ...patch };

  if (existing) {
    const sets = PROFILE_FIELDS.map((f) => `${f} = ?`).join(', ');
    await env.DB.prepare(`UPDATE ae_users SET ${sets}, updated_at = ? WHERE email = ?`)
      .bind(...PROFILE_FIELDS.map((f) => str(merged[f]) || null), now, key).run();
  } else {
    const cols = PROFILE_FIELDS.join(', ');
    const marks = PROFILE_FIELDS.map(() => '?').join(', ');
    await env.DB.prepare(
      `INSERT INTO ae_users (email, role, ${cols}, created_at, created_by, updated_at)
       VALUES (?, 'rep', ${marks}, ?, ?, ?)`
    ).bind(key, ...PROFILE_FIELDS.map((f) => str(merged[f]) || null), now, key, now).run();
  }
  return await loadUserRow(env, key);
}

/** 查角色：bootstrap 清單優先，其次 ae_users，查無此人一律 rep。 */
async function resolveRole(env, email) {
  const boot = bootstrapRole(email, env.AE_PV_EMAILS);
  if (boot) return boot;
  try {
    const row = await env.DB.prepare(`SELECT role FROM ae_users WHERE email = ?`)
      .bind(normalizeEmail(email)).first();
    return normalizeRole(row?.role);
  } catch (e) {
    // ae_users 還沒建（schema 未更新）時不應整個 API 掛掉，但也不能因此放寬權限。
    console.log('resolveRole failed, defaulting to rep:', e?.message || e);
    return 'rep';
  }
}

// ── 附件：把 dataURL 搬到 R2 ─────────────────────────────────────────────

function dataUrlToBytes(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl || '');
  if (!m) return null;
  const [, mime, isB64, data] = m;
  if (isB64) {
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { mime: mime || 'application/octet-stream', bytes };
  }
  return { mime: mime || 'text/plain', bytes: new TextEncoder().encode(decodeURIComponent(data)) };
}

/**
 * 把 payload.attachments 裡夾帶的 dataURL 搬進 R2，payload 只留下指標。
 *
 * 這樣做的理由：一張壓縮後的藥盒照 300KB–1.5MB，若留在 payload 裡，
 * 每次讀個案（收件匣列表也算）都會把它一起拖出來，而且 D1 有單列大小限制。
 * 前端不需要為此多送一次請求——送出仍是單一 POST。
 */
async function offloadAttachments(env, caseId, report, actor, nowIso) {
  const list = Array.isArray(report?.attachments) ? report.attachments : [];
  if (!list.length || !env.AE_FILES) return list;

  const kept = [];
  for (const a of list) {
    // 已經是 R2 指標（例如追蹤報告或重送）就原樣保留
    if (!a?.dataUrl) { kept.push(a); continue; }
    const decoded = dataUrlToBytes(a.dataUrl);
    if (!decoded) continue;

    const key = `${caseId}/${a.id}`;
    await env.AE_FILES.put(key, decoded.bytes, {
      httpMetadata: { contentType: a.mime || decoded.mime },
    });
    await env.DB.prepare(
      `INSERT OR REPLACE INTO ae_attachments (id, case_id, r2_key, name, mime, size, added_at, added_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      a.id, caseId, key, str(a.name), str(a.mime || decoded.mime),
      decoded.bytes.length, str(a.addedAt) || nowIso, actor
    ).run();

    kept.push({
      id: a.id,
      name: a.name,
      mime: a.mime || decoded.mime,
      size: decoded.bytes.length,
      addedAt: a.addedAt || nowIso,
      // 前端改讀這個 URL；dataUrl 不再回傳
      url: `/api/ae-reports/${caseId}/attachments/${a.id}`,
    });
  }
  return kept;
}

// ── 稽核軌跡 ────────────────────────────────────────────────────────────

/**
 * 寫入稽核軌跡。actor 由呼叫端傳入已驗證的身分，**不從 entries 取**。
 * 前端送來的 auditTrail 只借用它的 action/detail/at，身分一律改寫。
 */
async function appendAudit(env, caseId, actor, entries) {
  const rows = (entries || []).filter((e) => e && e.action);
  for (const e of rows) {
    await env.DB.prepare(
      `INSERT INTO ae_audit (case_id, at, actor, action, detail) VALUES (?, ?, ?, ?, ?)`
    ).bind(caseId, str(e.at) || new Date().toISOString(), actor, str(e.action), str(e.detail) || null).run();
  }
}

async function loadAudit(env, caseId) {
  const { results } = await env.DB.prepare(
    `SELECT at, actor, action, detail FROM ae_audit WHERE case_id = ? ORDER BY seq ASC`
  ).bind(caseId).all();
  return (results || []).map((r) => ({
    at: r.at, actor: r.actor, action: r.action, detail: r.detail || undefined,
  }));
}

// ── 個案的讀寫 ──────────────────────────────────────────────────────────

/** 把資料列還原成前端要的 AEReport；稽核軌跡以資料庫為準覆蓋 payload 裡的版本。 */
function rowToReport(row, audit) {
  let report;
  try {
    report = JSON.parse(row.payload);
  } catch {
    return null;
  }
  return {
    ...report,
    id: row.id,
    status: row.status,
    auditTrail: audit,
    // 伺服器側事實，前端唯讀
    submittedBy: row.submitted_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 列出個案。**過濾寫在 SQL 的 WHERE 裡，不是取出全部再於 JS 篩掉**——
 * 後者只要哪天有人改了迴圈就會整份外洩，而且真的把別人的病人資料讀進了記憶體。
 */
async function listCases(env, url, role, actor) {
  // include_deleted 只對藥安人員有意義；業務端一律看不到已作廢個案。
  const includeDeleted = role === 'pv' && url.searchParams.get('include_deleted') === '1';
  const limit = Math.min(Number(url.searchParams.get('limit') || '500') || 500, 1000);

  const where = [];
  const binds = [];
  if (!includeDeleted) where.push('deleted_at IS NULL');
  if (role !== 'pv') { where.push('LOWER(submitted_by) = ?'); binds.push(normalizeEmail(actor)); }

  const { results } = await env.DB.prepare(
    `SELECT * FROM ae_cases
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY (due_date IS NULL) ASC, due_date ASC, created_at DESC
      LIMIT ?`
  ).bind(...binds, limit).all();

  const cases = [];
  for (const row of results || []) {
    const report = rowToReport(row, await loadAudit(env, row.id));
    if (report) cases.push(report);
  }
  return cases;
}

async function upsertCase(env, report, actor, { isNew }) {
  const now = new Date().toISOString();
  const id = str(report?.id);
  if (!id) throw new HttpError(400, 'missing case id');

  const attachments = await offloadAttachments(env, id, report, actor, now);
  // 稽核軌跡不進 payload：它是獨立的、只增不改的表
  const { auditTrail, ...rest } = report || {};
  const payload = JSON.stringify({ ...rest, attachments });
  const col = indexColumns(report);

  const existing = await env.DB.prepare(`SELECT id, created_at, submitted_by FROM ae_cases WHERE id = ?`)
    .bind(id).first();

  if (existing) {
    await env.DB.prepare(
      `UPDATE ae_cases SET payload=?, case_number=?, status=?, report_type=?, follow_up_of_id=?,
         awareness_date=?, due_date=?, serious=?, country=?, suspect_drug=?, patient_key=?, updated_at=?
       WHERE id=?`
    ).bind(
      payload, col.case_number, col.status, col.report_type, col.follow_up_of_id,
      col.awareness_date, col.due_date, col.serious, col.country, col.suspect_drug,
      col.patient_key, now, id
    ).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO ae_cases (id, payload, case_number, status, report_type, follow_up_of_id,
         awareness_date, due_date, serious, country, suspect_drug, patient_key,
         submitted_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id, payload, col.case_number, col.status, col.report_type, col.follow_up_of_id,
      col.awareness_date, col.due_date, col.serious, col.country, col.suspect_drug,
      col.patient_key, actor, now, now
    ).run();
  }

  // 前端帶來的軌跡照收（action/detail/at），但身分改寫為已驗證的 actor
  await appendAudit(env, id, actor, auditTrail);
  if (isNew && !existing) {
    await appendAudit(env, id, actor, [{ at: now, action: 'received', detail: `由 ${actor} 送達後台` }]);
  }
  return id;
}

// ── HTTP 處理 ───────────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/**
 * AE API 路由。回傳 Response，或回傳 null 表示「這個路徑不歸我管」（交還給 LLM proxy）。
 * @param identity 已驗證的 Access JWT payload；未啟用 Access 時為 null（僅本機開發）
 */
export async function handleAeRequest(request, env, url, identity, cors) {
  const path = url.pathname.replace(/\/+$/, '');
  const isMe = path === '/api/me';
  if (!isMe && !path.startsWith('/api/ae-reports')) return null;

  if (!env.DB) {
    return json({ error: 'AE backend not configured: D1 binding "DB" is missing' }, 501, cors);
  }

  // 身分是這個 API 的地基：沒有可信身分，稽核軌跡就沒有意義，寧可整個拒絕服務。
  const actor = identity?.email || identity?.sub;
  if (!actor) {
    return json({ error: 'unauthorized: no verified identity' }, 401, cors);
  }

  const role = await resolveRole(env, actor);
  const forbidden = () => json({ error: 'forbidden: requires PV role' }, 403, cors);

  // /api/me —— 身分、角色與通報者個人檔案。
  // 前端據此決定顯示通報表單還是後台、以及要不要先請他建檔；
  // 真正的守門仍在每一條路由上，這裡回什麼都不影響權限。
  if (isMe) {
    // 自己的 try：這一段在下方個案路由的 try 之外，少了它，readJson 對格式錯誤
    // 丟出的 400 會逃逸成一個沒有內容的 500。
    try {
      const defaults = { org: env.AE_ORG_NAME };
      if (request.method === 'GET') {
        const row = await loadUserRow(env, actor);
        return json({
          email: actor, role,
          profile: rowToProfile(row, defaults),
          profileComplete: isProfileComplete(row),
        }, 200, cors);
      }
      if (request.method === 'PUT') {
        // 只寫自己的檔案：目標 email 取自 JWT，請求內容給不了。
        const patch = sanitizeProfile(await readJson(request));
        const row = await saveProfile(env, actor, patch);
        return json({
          ok: true, email: actor, role,
          profile: rowToProfile(row, defaults),
          profileComplete: isProfileComplete(row),
        }, 200, cors);
      }
      return json({ error: 'method not allowed' }, 405, cors);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, cors);
      console.log('me api error:', e?.stack || e);
      return json({ error: 'internal error' }, 500, cors);
    }
  }

  const rest = path.slice('/api/ae-reports'.length);      // '' | '/:id' | '/:id/attachments/:attId'
  const seg = rest.split('/').filter(Boolean);

  try {
    // /api/ae-reports
    if (seg.length === 0) {
      if (request.method === 'GET') {
        return json({ cases: await listCases(env, url, role, actor) }, 200, cors);
      }
      if (request.method === 'POST') {
        const report = await readJson(request);
        // 業務可以新增，但不能藉由重送覆寫別人的個案，也不能洗掉藥安已開始的處理。
        if (role !== 'pv') {
          const existing = await env.DB.prepare(`SELECT submitted_by, status FROM ae_cases WHERE id = ?`)
            .bind(str(report?.id)).first();
          if (!canRepOverwrite(actor, existing)) {
            return json({ error: 'forbidden: case already exists and is not yours to overwrite' }, 403, cors);
          }
        }
        const id = await upsertCase(env, report, actor, { isNew: true });
        return json({ ok: true, id }, 201, cors);
      }
      return json({ error: 'method not allowed' }, 405, cors);
    }

    const caseId = seg[0];

    // /api/ae-reports/:id/attachments/:attId
    if (seg.length === 3 && seg[1] === 'attachments') {
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, cors);
      // 先確認這個人讀得到這個「個案」，才談附件——附件的權限跟著個案走。
      const owner = await env.DB.prepare(`SELECT submitted_by FROM ae_cases WHERE id = ?`).bind(caseId).first();
      if (!canReadCase(role, actor, owner)) return json({ error: 'not found' }, 404, cors);
      const row = await env.DB.prepare(
        `SELECT r2_key, mime, name FROM ae_attachments WHERE id = ? AND case_id = ? AND deleted_at IS NULL`
      ).bind(seg[2], caseId).first();
      if (!row || !env.AE_FILES) return json({ error: 'not found' }, 404, cors);
      const obj = await env.AE_FILES.get(row.r2_key);
      if (!obj) return json({ error: 'not found' }, 404, cors);
      return new Response(obj.body, {
        headers: {
          ...cors,
          'Content-Type': row.mime || 'application/octet-stream',
          // 附件可能夾帶病人資訊，一律不給共用快取留存
          'Cache-Control': 'private, max-age=300',
        },
      });
    }

    // /api/ae-reports/:id
    if (seg.length === 1) {
      if (request.method === 'GET') {
        const row = await env.DB.prepare(`SELECT * FROM ae_cases WHERE id = ?`).bind(caseId).first();
        // 讀不到別人的個案時回 404 而非 403：403 等於告訴對方「這個 id 存在」，
        // 個案編號是可猜的序號，這點差別足以讓人推敲出通報量。
        if (!row || !canReadCase(role, actor, row)) return json({ error: 'not found' }, 404, cors);
        return json({ case: rowToReport(row, await loadAudit(env, caseId)) }, 200, cors);
      }

      if (request.method === 'PATCH') {
        // 判定、編碼、送件都是藥安的工作；通報者送出後就不再改動個案。
        if (role !== 'pv') return forbidden();
        const row = await env.DB.prepare(`SELECT id FROM ae_cases WHERE id = ?`).bind(caseId).first();
        if (!row) return json({ error: 'not found' }, 404, cors);
        const report = await readJson(request);
        await upsertCase(env, { ...report, id: caseId }, actor, { isNew: false });
        return json({ ok: true }, 200, cors);
      }

      if (request.method === 'DELETE') {
        if (role !== 'pv') return forbidden();
        // 軟刪除。個案從收件匣消失，但列與稽核軌跡都留著，日後查核仍看得到發生過什麼。
        const reason = url.searchParams.get('reason') || '';
        const now = new Date().toISOString();
        const res = await env.DB.prepare(
          `UPDATE ae_cases SET deleted_at=?, deleted_by=?, deleted_reason=?, updated_at=?
           WHERE id=? AND deleted_at IS NULL`
        ).bind(now, actor, reason || null, now, caseId).run();
        if (!res.meta?.changes) return json({ error: 'not found or already deleted' }, 404, cors);
        await appendAudit(env, caseId, actor, [
          { at: now, action: 'soft_deleted', detail: reason || '未填理由' },
        ]);
        return json({ ok: true }, 200, cors);
      }

      return json({ error: 'method not allowed' }, 405, cors);
    }

    return json({ error: 'not found' }, 404, cors);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status, cors);
    console.log('ae api error:', e?.stack || e);
    return json({ error: 'internal error' }, 500, cors);
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'invalid JSON body');
  }
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
