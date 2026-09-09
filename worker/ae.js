// PV-Link 不良反應個案（AE）收案 API — Cloudflare Worker 端。
//
// 端點（全部掛在 /api/ae-reports 之下，並由 index.js 先驗過 Cloudflare Access JWT）：
//   GET    /api/ae-reports                          列出個案（不含附件本體）
//   POST   /api/ae-reports                          送出／覆寫個案（業務通報、追蹤報告）
//   GET    /api/ae-reports/:id                      取單一個案（含稽核軌跡）
//   PATCH  /api/ae-reports/:id                      後台判定更新
//   DELETE /api/ae-reports/:id                      軟刪除（標記作廢，軌跡永遠留著）
//   GET    /api/ae-reports/:id/attachments/:attId   取附件本體（R2）
//
// 貫穿全檔的兩條規則：
//   1. **actor 一律取自已驗證的 Access JWT，永不採信請求內容。** 前端送來的
//      auditTrail[].actor 一概忽略並改寫。稽核軌跡若能被前端自報身分，就等於沒有軌跡。
//   2. **個案不做實體刪除。** DELETE 只寫 deleted_at；稽核軌跡表另有資料庫層 trigger
//      擋掉任何 UPDATE / DELETE。

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

async function listCases(env, url) {
  const includeDeleted = url.searchParams.get('include_deleted') === '1';
  const limit = Math.min(Number(url.searchParams.get('limit') || '500') || 500, 1000);
  const { results } = await env.DB.prepare(
    `SELECT * FROM ae_cases
      ${includeDeleted ? '' : 'WHERE deleted_at IS NULL'}
      ORDER BY (due_date IS NULL) ASC, due_date ASC, created_at DESC
      LIMIT ?`
  ).bind(limit).all();

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
  if (!path.startsWith('/api/ae-reports')) return null;

  if (!env.DB) {
    return json({ error: 'AE backend not configured: D1 binding "DB" is missing' }, 501, cors);
  }

  // 身分是這個 API 的地基：沒有可信身分，稽核軌跡就沒有意義，寧可整個拒絕服務。
  const actor = identity?.email || identity?.sub;
  if (!actor) {
    return json({ error: 'unauthorized: no verified identity' }, 401, cors);
  }

  const rest = path.slice('/api/ae-reports'.length);      // '' | '/:id' | '/:id/attachments/:attId'
  const seg = rest.split('/').filter(Boolean);

  try {
    // /api/ae-reports
    if (seg.length === 0) {
      if (request.method === 'GET') {
        return json({ cases: await listCases(env, url) }, 200, cors);
      }
      if (request.method === 'POST') {
        const report = await readJson(request);
        const id = await upsertCase(env, report, actor, { isNew: true });
        return json({ ok: true, id }, 201, cors);
      }
      return json({ error: 'method not allowed' }, 405, cors);
    }

    const caseId = seg[0];

    // /api/ae-reports/:id/attachments/:attId
    if (seg.length === 3 && seg[1] === 'attachments') {
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, cors);
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
        if (!row) return json({ error: 'not found' }, 404, cors);
        return json({ case: rowToReport(row, await loadAudit(env, caseId)) }, 200, cors);
      }

      if (request.method === 'PATCH') {
        const row = await env.DB.prepare(`SELECT id FROM ae_cases WHERE id = ?`).bind(caseId).first();
        if (!row) return json({ error: 'not found' }, 404, cors);
        const report = await readJson(request);
        await upsertCase(env, { ...report, id: caseId }, actor, { isNew: false });
        return json({ ok: true }, 200, cors);
      }

      if (request.method === 'DELETE') {
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
