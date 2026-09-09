// AE 個案的資料通道（送出、讀取、更新、刪除）與附件處理。
//
// 兩種模式，由 VITE_AE_API_ENDPOINT 是否設定決定：
//   • **遠端模式**（正式部署）：讀寫都走 Cloudflare Worker 的 /api/ae-reports。
//     業務手機送出的個案才會真的離開那支手機，辦公室的後台才看得到。
//   • **本機模式**（未設端點）：讀寫都在瀏覽器的 IndexedDB。只適合單機試用與展示——
//     通報端與後台必須是同一台裝置的同一個瀏覽器。
//
// 送出失敗（斷網、5xx）一律進 outbox 佇列，恢復連線後由 flushOutbox 補送。
//
// ⚠️ 業務在外面跑客戶，訊號不穩是常態。「送出失敗就把資料丟掉」是這類表單最常見也最致命的缺陷，
//    所以送出路徑上的每一個失敗分支都必須落地到 outbox，不得只顯示錯誤訊息。

import { AEReport } from './aeReport';
import {
  loadRecords, saveRecords, loadValue, saveValue,
  AE_CASES_KEY, AE_OUTBOX_KEY,
} from './storage';

// 集合端點（不含個案 id），例：/api/ae-reports
const ENDPOINT: string = ((import.meta as any)?.env?.VITE_AE_API_ENDPOINT || '').replace(/\/+$/, '');
// 身分端點：與收案端點同源同層，例 /api/ae-reports → /api/me
const ME_ENDPOINT: string = ENDPOINT.replace(/\/[^/]*$/, '/me');
/** 與後端共享的簡易存取權杖（若後端有設）。非機密等級的憑證，僅防開放式代理。 */
const TOKEN: string = (import.meta as any)?.env?.VITE_AE_API_TOKEN || '';

export type SubmitChannel = 'remote' | 'local' | 'outbox';

export interface SubmitResult {
  ok: boolean;
  channel: SubmitChannel;
  message?: string;
}

export const hasRemoteEndpoint = () => Boolean(ENDPOINT);

const headers = () => ({
  'Content-Type': 'application/json',
  ...(TOKEN ? { 'X-PV-Token': TOKEN } : {}),
});

/**
 * 呼叫後端。同源部署下，Cloudflare Access 的 CF_Authorization cookie 由瀏覽器自動帶上，
 * Worker 據此驗證身分——前端不持有、也不需要任何憑證。
 * credentials: 'same-origin' 是預設值，此處明寫以表明這條依賴。
 */
async function callApi(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${ENDPOINT}${path}`, {
    credentials: 'same-origin',
    headers: headers(),
    ...init,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

async function postRemote(report: AEReport): Promise<void> {
  await callApi('', { method: 'POST', body: JSON.stringify(report) });
}

async function saveLocal(report: AEReport): Promise<void> {
  const cases = (await loadRecords(AE_CASES_KEY)) as AEReport[];
  // 以 id 為主鍵 upsert：追蹤報告重送同一 id 時覆蓋，而非堆出重複個案
  const idx = cases.findIndex(c => c?.id === report.id);
  if (idx >= 0) cases[idx] = report; else cases.unshift(report);
  await saveRecords(AE_CASES_KEY, cases);
}

async function enqueueOutbox(report: AEReport): Promise<void> {
  const queue = ((await loadValue<AEReport[]>(AE_OUTBOX_KEY)) || []).filter(r => r?.id !== report.id);
  queue.push(report);
  await saveValue(AE_OUTBOX_KEY, queue);
}

/** 送出一筆個案。任何失敗都會落到 outbox，回傳 channel 讓 UI 誠實告知使用者實際去向。 */
export async function submitAEReport(report: AEReport): Promise<SubmitResult> {
  try {
    if (ENDPOINT) {
      await postRemote(report);
      return { ok: true, channel: 'remote' };
    }
    await saveLocal(report);
    return { ok: true, channel: 'local' };
  } catch (e: any) {
    try {
      await enqueueOutbox(report);
      return { ok: false, channel: 'outbox', message: e?.message || String(e) };
    } catch (e2: any) {
      // outbox 也寫不進去（儲存空間滿）：這是唯一真正會遺失資料的情況，必須讓使用者知道
      return { ok: false, channel: 'outbox', message: `佇列寫入失敗：${e2?.message || String(e2)}` };
    }
  }
}

/**
 * 讀出所有個案。遠端模式向後端要，本機模式讀 IndexedDB。
 * 遠端失敗時**不**靜默退回本機資料——那會讓後台顯示一份過時且不完整的清單，
 * 而藥安人員無從得知。寧可讓錯誤浮上來。
 */
export async function listAECases(): Promise<AEReport[]> {
  if (!ENDPOINT) return (await loadRecords(AE_CASES_KEY)) as AEReport[];
  const res = await callApi('');
  const data = await res.json();
  return Array.isArray(data?.cases) ? data.cases : [];
}

/**
 * 新增或更新個案（後台判定、追蹤報告建立都走這裡）。
 *
 * `create` 決定遠端用哪個動詞：追蹤報告是在後台產生的**新**個案，後端還沒有這一筆，
 * PATCH 會回 404。反過來，更新既有個案不用 POST，是為了保留 PATCH 對「個案不存在
 * （例如已被別人軟刪除）」回 404 的守門作用——靜默建回一筆已刪除的個案更糟。
 */
export async function saveAECase(report: AEReport, opts: { create?: boolean } = {}): Promise<void> {
  if (!ENDPOINT) {
    const cases = (await loadRecords(AE_CASES_KEY)) as AEReport[];
    const idx = cases.findIndex(c => c?.id === report.id);
    if (idx >= 0) cases[idx] = report; else cases.unshift(report);
    await saveRecords(AE_CASES_KEY, cases);
    return;
  }
  if (opts.create) {
    await callApi('', { method: 'POST', body: JSON.stringify(report) });
    return;
  }
  await callApi(`/${encodeURIComponent(report.id)}`, {
    method: 'PATCH',
    body: JSON.stringify(report),
  });
}

/**
 * 刪除個案。遠端是**軟刪除**：個案從收件匣消失，但資料列與稽核軌跡都留著，
 * 日後查核仍看得到發生過什麼。本機模式沒有這個保證（僅供展示）。
 */
export async function deleteAECase(id: string, reason = ''): Promise<void> {
  if (!ENDPOINT) {
    const cases = (await loadRecords(AE_CASES_KEY)) as AEReport[];
    await saveRecords(AE_CASES_KEY, cases.filter(c => c?.id !== id));
    return;
  }
  await callApi(`/${encodeURIComponent(id)}?reason=${encodeURIComponent(reason)}`, { method: 'DELETE' });
}

// ── 身分與角色 ────────────────────────────────────────────────────────

export type AERole = 'rep' | 'pv';

export interface AEIdentity {
  email: string;
  role: AERole;
}

/**
 * 取得目前登入者的身分與角色（遠端模式向 `/api/me` 問）。
 *
 * 本機模式沒有後端也就沒有身分，一律當作 pv：那是單機展示情境，
 * 把展示用的瀏覽器鎖成業務端只會讓人以為系統壞了。
 *
 * ⚠️ 這個角色**只用來決定畫面顯示什麼**。真正的守門在 Worker：
 * 每一條 API 都自己查角色，前端就算被改也拿不到別人的個案。
 */
export async function fetchIdentity(): Promise<AEIdentity> {
  if (!ENDPOINT) return { email: '', role: 'pv' };
  const res = await fetch(`${ME_ENDPOINT}`, { credentials: 'same-origin', headers: headers() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { email: String(data?.email || ''), role: data?.role === 'pv' ? 'pv' : 'rep' };
}

/** 附件的顯示來源：本機模式是 dataURL，遠端模式是後端的附件網址。 */
export function attachmentSrc(a: { dataUrl?: string; url?: string }): string {
  return a?.dataUrl || a?.url || '';
}

export async function outboxCount(): Promise<number> {
  return ((await loadValue<AEReport[]>(AE_OUTBOX_KEY)) || []).length;
}

/** 補送 outbox。逐筆送出，成功才移除；任何一筆失敗即停止並保留其餘，避免順序錯亂。 */
export async function flushOutbox(): Promise<{ sent: number; remaining: number }> {
  const queue = (await loadValue<AEReport[]>(AE_OUTBOX_KEY)) || [];
  let sent = 0;
  while (queue.length) {
    const item = queue[0];
    try {
      if (ENDPOINT) await postRemote(item);
      else await saveLocal(item);
      queue.shift();
      sent++;
    } catch {
      break;
    }
  }
  await saveValue(AE_OUTBOX_KEY, queue);
  return { sent, remaining: queue.length };
}

// ─────────────────────────────────────────────────────────────
// 附件：手機拍照壓縮
// ─────────────────────────────────────────────────────────────

export const MAX_ATTACHMENT_BYTES = 1_500_000;
export const MAX_ATTACHMENTS = 6;

/**
 * 手機直出照片動輒 4–8MB，直接塞進 IndexedDB 會拖垮送出與同步。
 * 這裡在瀏覽器端縮到長邊 maxEdge 並以 JPEG 重新編碼；藥盒批號、檢驗單數字在 1600px 下仍可辨讀。
 * 非圖片檔（PDF 等）原樣讀取，只做大小上限檢查。
 */
export function compressImage(file: File, maxEdge = 1600, quality = 0.72): Promise<{ dataUrl: string; size: number; mime: string }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        if (file.size > MAX_ATTACHMENT_BYTES * 4) { reject(new Error('FILE_TOO_LARGE')); return; }
        resolve({ dataUrl, size: file.size, mime: file.type || 'application/octet-stream' });
      };
      reader.onerror = () => reject(reader.error || new Error('READ_FAILED'));
      reader.readAsDataURL(file);
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('CANVAS_UNAVAILABLE')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      // 仍過大時再降一階畫質，避免單張照片就吃掉整個儲存配額
      if (dataUrl.length * 0.75 > MAX_ATTACHMENT_BYTES) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.5);
      }
      resolve({ dataUrl, size: Math.round(dataUrl.length * 0.75), mime: 'image/jpeg' });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('DECODE_FAILED')); };
    img.src = url;
  });
}
