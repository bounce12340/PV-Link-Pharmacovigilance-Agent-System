import { emptyWork, validateWork } from './caseWorkModel.js';
import { hasRemoteEndpoint } from './aeApi';
export type CaseWork = { version: number; assignee: string; nextAction: string; workDueDate: string; items: { id: string; title: string; status: string }[]; contacts: { id: string; date: string; method: string; result: string; nextFollowUp: string }[] };
export type WorkResult = { work: CaseWork; audit: { version: number; at: string; actor: string; action: string }[] };
const endpoint = ((import.meta as any).env?.VITE_AE_API_ENDPOINT || '').replace(/\/+$/, '');
async function api(path: string, body?: CaseWork) {
  const token = (import.meta as any).env?.VITE_AE_API_TOKEN || '';
  const res = await fetch(endpoint + path, { credentials: 'same-origin', method: body ? 'PUT' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-PV-Token': token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!res.ok) throw new Error(res.status === 409 ? 'WORK_CONFLICT' : res.status === 400 ? 'INVALID_WORK' : `HTTP ${res.status}`);
  return res.json();
}
// Dedicated IndexedDB transaction provides atomic CAS across tabs; never used as remote fallback.
function local(id: string, input?: CaseWork): Promise<WorkResult> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('pv-case-work-demo', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('work');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('work', input ? 'readwrite' : 'readonly'), store = tx.objectStore('work');
      let result: WorkResult; let error: Error;
      const get = store.get(id);
      get.onsuccess = () => {
        result = get.result || { work: emptyWork(), audit: [] };
        if (input) {
          if (input.version !== result.work.version) { error = new Error('WORK_CONFLICT'); tx.abort(); return; }
          result = { work: { ...input, version: input.version + 1 }, audit: [{ version: input.version + 1, actor: 'local-demo', at: new Date().toISOString(), action: 'work_saved' }, ...result.audit].slice(0, 100) };
          store.put(result, id);
        }
      };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(error || tx.error || new Error('STORAGE_ERROR')); };
    };
  });
}
export const workUsers = async (): Promise<string[]> => hasRemoteEndpoint() ? (await api('/work-users')).users : ['local-demo'];
export const getCaseWork = (id: string): Promise<WorkResult> => hasRemoteEndpoint() ? api(`/${encodeURIComponent(id)}/work`) : local(id);
export async function saveCaseWork(id: string, input: CaseWork): Promise<WorkResult> {
  const work = validateWork(input);
  if (!hasRemoteEndpoint() && work.assignee && work.assignee !== 'local-demo') throw new Error('INVALID_WORK');
  return hasRemoteEndpoint() ? api(`/${encodeURIComponent(id)}/work`, work) : local(id, work);
}
