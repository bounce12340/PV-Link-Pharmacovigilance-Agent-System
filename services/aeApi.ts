// AE 個案的送出通道與附件處理。
//
// 送出策略（依序）：
//   1. 若設定了 VITE_AE_API_ENDPOINT → POST 到後端（正式部署應走這條，個案才會離開手機）。
//   2. 未設定端點 → 直接寫入本機 IndexedDB 個案庫（單機 / 展示 / 離線試用模式）。
//   3. 上述失敗（斷網、伺服器 5xx）→ 進入 outbox 佇列，恢復連線後由 flushOutbox 補送。
//
// ⚠️ 業務在外面跑客戶，訊號不穩是常態。「送出失敗就把資料丟掉」是這類表單最常見也最致命的缺陷，
//    所以送出路徑上的每一個失敗分支都必須落地到 outbox，不得只顯示錯誤訊息。

import { AEReport } from './aeReport';
import {
  loadRecords, saveRecords, loadValue, saveValue,
  AE_CASES_KEY, AE_OUTBOX_KEY,
} from './storage';

const ENDPOINT: string = (import.meta as any)?.env?.VITE_AE_API_ENDPOINT || '';
/** 與後端共享的簡易存取權杖（若後端有設）。非機密等級的憑證，僅防開放式代理。 */
const TOKEN: string = (import.meta as any)?.env?.VITE_AE_API_TOKEN || '';

export type SubmitChannel = 'remote' | 'local' | 'outbox';

export interface SubmitResult {
  ok: boolean;
  channel: SubmitChannel;
  message?: string;
}

export const hasRemoteEndpoint = () => Boolean(ENDPOINT);

async function postRemote(report: AEReport): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { 'X-PV-Token': TOKEN } : {}),
    },
    body: JSON.stringify(report),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
