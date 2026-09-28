import { describe, it, expect } from 'vitest';
import { emptyWork, validateWork, matchesWork } from '../services/caseWorkModel.js';
import { handleWork } from '../worker/work.js';
import { handleAeRequest } from '../worker/ae.js';
import { workZh, workEn } from '../i18n/work';
const request = (method = 'GET', body?: any) => new Request('https://example.test/api/ae-reports/demo/work', { method, ...(body ? { body: JSON.stringify(body) } : {}) });
function mock(changes = 1) {
 const writes: any[] = [];
 const env = { AE_PV_EMAILS: 'bootstrap@example.test', DB: { prepare(sql: string) {
   let args: any[] = [];
   return { bind(...v: any[]) { args = v; return this; },
     async first() { if (sql.includes('FROM ae_users')) return { role: 'pv' }; if (sql.includes('FROM ae_case_work')) return null; return { id: 'demo' }; },
     async all() { return { results: sql.includes('FROM ae_users') ? [{ email: 'pv@example.test' }] : [] }; },
     async run() { writes.push({ sql, args }); return { meta: { changes } }; }
   };
 } } };
 return { env, writes };
}
describe('case work strict model and service rules', () => {
 it('normalizes validated work without touching regulatory fields', () => {
   const work = validateWork({ ...emptyWork(), assignee: ' PV@example.test ', nextAction: ' ask ' });
   expect(work.assignee).toBe('pv@example.test'); expect(work.nextAction).toBe('ask'); expect('dueDate' in work).toBe(false);
 });
 it('rejects unknown fields and forged actor/time/version', () => {
   for (const patch of [{ actor: 'fake' }, { at: '1900-01-01' }, { version: -1 }, { version: 1.5 }, { dueDate: '2026-01-01' }]) expect(() => validateWork({ ...emptyWork(), ...patch })).toThrow('INVALID_WORK');
 });
 it('validates dates, lists, lengths, required values and enums', () => {
   for (const patch of [{ workDueDate: '2026-02-30' }, { workDueDate: '2026-2-01' }, { nextAction: 'x'.repeat(1001) }, { items: Array(51).fill({}) }, { contacts: Array(101).fill({}) }, { items: [{ id: 'a', title: 'item', status: 'bad' }] }, { contacts: [{ id: 'a', date: '', method: 'phone', result: 'ok', nextFollowUp: '' }] }]) expect(() => validateWork({ ...emptyWork(), ...patch })).toThrow('INVALID_WORK');
 });
 it('accepts requests and structured contacts', () => {
   const w = { ...emptyWork(), items: [{ id: 'i', title: 'Synthetic request', status: 'received' }], contacts: [{ id: 'c', date: '2026-09-01', method: 'email', result: 'Synthetic contact', nextFollowUp: '2026-10-01' }] };
   expect(validateWork(w)).toEqual(w);
 });
 it('filters mine, unassigned and internal overdue only', () => {
   const w = { ...emptyWork(), assignee: 'pv@example.test', workDueDate: '2026-09-01' };
   expect(matchesWork(w, 'mine', 'PV@example.test', '2026-09-02')).toBe(true);
   expect(matchesWork(w, 'unassigned', '', '2026-09-02')).toBe(false);
   expect(matchesWork(w, 'overdue', '', '2026-09-02')).toBe(true);
   expect(matchesWork(w, 'overdue', '', '2026-09-01')).toBe(false);
   expect(matchesWork(emptyWork(), 'mine', '', '2026-09-01')).toBe(false);
 });
 it('has exact locale parity with no empty labels', () => {
   expect(Object.keys(workZh).sort()).toEqual(Object.keys(workEn).sort());
   for (const value of [...Object.values(workZh), ...Object.values(workEn)]) expect(value.length).toBeGreaterThan(0);
 });
});
describe('case work backend isolation and authorization', () => {
 it('rejects reps before querying work or user directory', async () => {
   const env = { DB: { prepare() { throw Error('must not query'); } } };
   for (const seg of [['demo', 'work'], ['work-users']]) for (const method of ['GET', 'PUT']) expect((await handleWork(request(method, method === 'PUT' ? emptyWork() : undefined), env, seg, 'rep', 'rep@example.test', {})).status).toBe(403);
 });
 it('returns empty work and PV-only minimal directory', async () => {
   const { env } = mock();
   expect((await (await handleWork(request(), env, ['demo', 'work'], 'pv', 'pv@example.test', {})).json()).work.version).toBe(0);
   const result = await handleWork(request(), env, ['work-users'], 'pv', 'pv@example.test', {});
   expect((await result.json()).users).toEqual(['pv@example.test', 'bootstrap@example.test']);
   expect(result.headers.get('Cache-Control')).toBe('no-store');
 });
 it('generates actor/time, increments version and uses conditional SQL', async () => {
   const { env, writes } = mock();
   const result = await handleWork(request('PUT', { ...emptyWork(), assignee: 'pv@example.test' }), env, ['demo', 'work'], 'pv', 'verified@example.test', {});
   expect(result.status).toBe(200);
   const data = await result.json(); expect(data.work.version).toBe(1); expect(data.audit[0].actor).toBe('verified@example.test');
   expect(Date.parse(data.audit[0].at)).toBeGreaterThan(Date.parse('2026-01-01'));
   expect(writes[0].sql).toContain('WHERE ae_case_work.version = ?'); expect(writes[0].sql).toContain('deleted_at IS NULL'); expect(writes[0].args[4]).toBe('verified@example.test');
 });
 it('rejects stale writes with 409', async () => {
   const { env } = mock(0); expect((await handleWork(request('PUT', emptyWork()), env, ['demo', 'work'], 'pv', 'pv@example.test', {})).status).toBe(409);
 });
 it('rejects invalid assignee and forged audit without writes', async () => {
   const { env, writes } = mock();
   for (const patch of [{ assignee: 'rep@example.test' }, { actor: 'spoof' }, { at: '1900-01-01' }]) expect((await handleWork(request('PUT', { ...emptyWork(), ...patch }), env, ['demo', 'work'], 'pv', 'pv@example.test', {})).status).toBe(400);
   expect(writes.length).toBe(0);
 });
 it('rejects oversized and malformed requests', async () => {
   const { env } = mock();
   expect((await handleWork(request('PUT', { data: 'x'.repeat(200001) }), env, ['demo', 'work'], 'pv', 'pv@example.test', {})).status).toBe(413);
   expect((await handleWork(new Request('https://example.test', { method: 'PUT', body: '{' }), env, ['demo', 'work'], 'pv', 'pv@example.test', {})).status).toBe(400);
 });
 it('rejects new internal fields on general POST before persistence', async () => {
   const { env } = mock();
   for (const patch of [{ workManagement: {} }, { assignee: 'spoof' }, { contacts: [] }, { workDueDate: '2026-09-01' }]) {
     const req = new Request('https://example.test/api/ae-reports', { method: 'POST', body: JSON.stringify({ id: 'demo', ...patch }) });
     expect((await handleAeRequest(req, { ...env, AE_PV_EMAILS: '', DB: { prepare() { return { bind() { return this; }, async first() { return { role: 'rep' }; } }; } } }, new URL(req.url), { email: 'rep@example.test' }, {})).status).toBe(400);
   }
 });
});
