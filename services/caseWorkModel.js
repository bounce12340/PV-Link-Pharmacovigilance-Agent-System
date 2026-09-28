// Shared strict schema: internal work is never part of AEReport.
export const WORK_FIELDS = ['workManagement', 'assignee', 'nextAction', 'workDueDate', 'items', 'contacts', 'workVersion'];
export function emptyWork() { return { version: 0, assignee: '', nextAction: '', workDueDate: '', items: [], contacts: [] }; }
export function validateWork(input) {
  const fail = () => { throw new Error('INVALID_WORK'); };
  const object = (v, keys) => { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k))) fail(); };
  const text = (v, max, required = false) => { if (typeof v !== 'string' || v.length > max || (required && !v.trim())) fail(); return v.trim(); };
  const date = (v, required = false) => {
    text(v, 10, required);
    if (v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v < '1900-01-01' || v > '9999-12-31' || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v)) fail();
    return v;
  };
  object(input, ['version', 'assignee', 'nextAction', 'workDueDate', 'items', 'contacts']);
  if (!Number.isSafeInteger(input.version) || input.version < 0) fail();
  if (!Array.isArray(input.items) || input.items.length > 50 || !Array.isArray(input.contacts) || input.contacts.length > 100) fail();
  const ids = new Set();
  const id = v => { text(v, 80, true); if (!/^[a-zA-Z0-9_-]+$/.test(v) || ids.has(v)) fail(); ids.add(v); return v; };
  return {
    version: input.version,
    assignee: text(input.assignee, 254).toLowerCase(),
    nextAction: text(input.nextAction, 1000),
    workDueDate: date(input.workDueDate),
    items: input.items.map(v => {
      object(v, ['id', 'title', 'status']);
      if (!['pending', 'received', 'cancelled'].includes(v.status)) fail();
      return { id: id(v.id), title: text(v.title, 300, true), status: v.status };
    }),
    contacts: input.contacts.map(v => {
      object(v, ['id', 'date', 'method', 'result', 'nextFollowUp']);
      if (!['phone', 'email', 'visit', 'other'].includes(v.method)) fail();
      return { id: id(v.id), date: date(v.date, true), method: v.method, result: text(v.result, 1000, true), nextFollowUp: date(v.nextFollowUp) };
    }),
  };
}
export function matchesWork(work, filter, actor, today) {
  if (filter === 'mine') return !!actor && work.assignee === actor.trim().toLowerCase();
  if (filter === 'unassigned') return !work.assignee;
  if (filter === 'overdue') return !!work.workDueDate && work.workDueDate < today;
  return true;
}
