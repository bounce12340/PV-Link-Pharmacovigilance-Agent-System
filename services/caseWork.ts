import { emptyWork, validateWork } from './caseWorkModel.js';
import { hasRemoteEndpoint } from './aeApi';
export type WorkStatus = 'todo' | 'in-progress' | 'waiting' | 'completed' | 'cancelled';
export type CaseWork = { version: number; status: WorkStatus | string; assignee: string; nextAction: string; workDueDate: string; items: { id: string; title: string; status: string }[]; contacts: { id: string; date: string; method: string; result: string; nextFollowUp: string }[]; completedAt?: string; completedBy?: string; cancelledAt?: string; cancelledBy?: string; cancelReason?: string };
export type WorkInput = Omit<CaseWork, 'completedAt' | 'completedBy' | 'cancelledAt' | 'cancelledBy'> & { cancelReason?: string };
export type WorkResult = { work: CaseWork; audit: { version: number; at: string; actor: string; action: string }[] };
export type Workbench = { timezone: 'Asia/Taipei'; today: string; weekStart: string; weekEnd: string; scope: 'today'|'week'|'overdue'; from: string; to: string; items: { caseId: string; caseNumber: string; version: number; status: WorkStatus; assignee: string; workDueDate: string; overdue: boolean }[] };
export type InAppNotification = { id: string; kind: 'work_assigned'|'work_due'; caseId: string; createdAt: string; readAt: string|null };
const endpoint = ((import.meta as any).env?.VITE_AE_API_ENDPOINT || '').replace(/\/+$/, '');
async function api(path: string, body?: unknown, method?: string) {
  const token = (import.meta as any).env?.VITE_AE_API_TOKEN || '';
  const res = await fetch(endpoint + path, { credentials: 'same-origin', method: method || (body ? 'PUT' : 'GET'), headers: { 'Content-Type': 'application/json', ...(token ? { 'X-PV-Token': token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!res.ok) throw new Error(res.status === 409 ? 'WORK_CONFLICT' : res.status === 400 ? 'INVALID_WORK' : `HTTP ${res.status}`);
  return res.json();
}
function local(id: string, input?: WorkInput): Promise<WorkResult> { return new Promise((resolve, reject) => { const open = indexedDB.open('pv-case-work-demo', 1); open.onupgradeneeded = () => open.result.createObjectStore('work'); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction('work', input ? 'readwrite' : 'readonly'), store = tx.objectStore('work'); let result: WorkResult; let error: Error; const get = store.get(id); get.onsuccess = () => { result = get.result || { work: emptyWork(), audit: [] }; if (input) { if (input.version !== result.work.version) { error = new Error('WORK_CONFLICT'); tx.abort(); return; } const now = new Date().toISOString(), work: CaseWork = { ...input, version: input.version + 1 }; if (work.status === 'completed') Object.assign(work, { completedAt: now, completedBy: 'local-demo' }); if (work.status === 'cancelled') Object.assign(work, { cancelledAt: now, cancelledBy: 'local-demo' }); result = { work, audit: [{ version: work.version, actor: 'local-demo', at: now, action: 'work_saved' }, ...result.audit].slice(0, 100) }; store.put(result, id); } }; tx.oncomplete = () => { db.close(); resolve(result); }; tx.onabort = tx.onerror = () => { db.close(); reject(error || tx.error || new Error('STORAGE_ERROR')); }; }; }); }
export const workUsers = async (): Promise<string[]> => hasRemoteEndpoint() ? (await api('/work-users')).users : ['local-demo'];
export const getCaseWork = (id: string): Promise<WorkResult> => hasRemoteEndpoint() ? api(`/${encodeURIComponent(id)}/work`) : local(id);
export async function saveCaseWork(id: string, input: WorkInput): Promise<WorkResult> {
  // Do not echo server lifecycle metadata back; it is deliberately rejected by Worker validation.
  const clean: WorkInput = { version: input.version, status: input.status, assignee: input.assignee, nextAction: input.nextAction, workDueDate: input.workDueDate, items: input.items, contacts: input.contacts, ...(input.cancelReason !== undefined ? { cancelReason: input.cancelReason } : {}) };
  const work = validateWork(clean);
  if (!hasRemoteEndpoint() && work.assignee && work.assignee !== 'local-demo') throw new Error('INVALID_WORK');
  return hasRemoteEndpoint() ? api(`/${encodeURIComponent(id)}/work`, clean) : local(id, clean);
}
/**
 * 把 ISO 時間戳顯示成產品工作時區（Asia/Taipei）的 YYYY-MM-DD HH:mm。
 *
 * 工作台的日期範圍、到期判定都以 Asia/Taipei 計算，稽核與提醒的時間若照
 * ISO 原樣顯示（UTC，帶 Z 與毫秒）就會跟畫面上其他日期差 8 小時，跨午夜時
 * 連日期都對不上。無法解析時原樣回傳——稽核資料寧可顯示原文，也不能顯示錯的時間。
 */
export function formatTaipeiDateTime(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

export const getWorkbench = (scope: 'today'|'week'|'overdue'): Promise<Workbench> => api(`/workbench?scope=${scope}`);
export const getNotifications = (): Promise<{notifications: InAppNotification[]}> => api('/notifications');
export const readNotifications = (ids: string[]) => api('/notifications/read', { ids }, 'POST');
