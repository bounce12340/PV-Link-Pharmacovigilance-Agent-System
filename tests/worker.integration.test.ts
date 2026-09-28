// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleAeRequest } from '../worker/ae.js';

// Run the actual schema/SQL with foreign keys, constraints and transactional batch semantics.
let sql: DatabaseSync;
let env: any;
let files: Map<string, Uint8Array>;
const report = (id = 'case1', extra = {}) => ({ id, caseNumber: id, status: 'submitted', events: [], drugs: [], ...extra });
const photo = { id: 'photo1', name: 'photo.txt', dataUrl: 'data:text/plain;base64,aGVsbG8=' };
function request(method: string, path = '', body?: unknown, actor = 'rep@example.test') {
  const url = new URL(`https://example.test/api/ae-reports${path}`);
  return handleAeRequest(new Request(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env, url, { email: actor }, {});
}
beforeEach(() => {
  sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8'));
  files = new Map();
  const prepare = (query: string) => ({ bind: (...args: any[]) => ({
    first: async () => sql.prepare(query).get(...args) || null,
    all: async () => ({ results: sql.prepare(query).all(...args) }),
    run: async () => ({ meta: sql.prepare(query).run(...args) }),
  }) });
  env = { AE_PV_EMAILS: 'pv@example.test', DB: { prepare, batch: async (statements: any[]) => {
    sql.exec('BEGIN');
    try { const results = []; for (const s of statements) results.push(await s.run()); sql.exec('COMMIT'); return results; }
    catch (e) { sql.exec('ROLLBACK'); throw e; }
  } }, AE_FILES: {
    put: vi.fn(async (key: string, bytes: Uint8Array) => { files.set(key, bytes); }),
    get: vi.fn(async (key: string) => files.has(key) ? { body: files.get(key) } : null),
  } };
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { sql.close(); vi.restoreAllMocks(); });

describe('AE API database regression', () => {
  it('updates same-case attachments without replacing original attribution', async () => {
    await request('POST', '', report('case1', { attachments: [photo] }));
    expect((await request('PATCH', '/case1', report('case1', { attachments: [{ ...photo, dataUrl: 'data:text/plain;base64,Y2hhbmdlZA==' }] }), 'pv@example.test'))?.status).toBe(200);
    expect(await (await request('GET', '/case1/attachments/photo1'))?.text()).toBe('changed');
    expect(sql.prepare('SELECT added_by FROM ae_attachments').get()?.added_by).toBe('rep@example.test');
  });
  it('rejects null attachment entries without saving a case', async () => {
    expect((await request('POST', '', report('case1', { attachments: [null] })))?.status).toBe(400);
    expect(sql.prepare('SELECT count(*) AS n FROM ae_cases').get()?.n).toBe(0);
  });
  it('does not save SQL state when R2 upload fails', async () => {
    env.AE_FILES.put = async () => { throw new Error('injected upload failure'); };
    expect((await request('POST', '', report('case1', { attachments: [photo] })))?.status).toBe(500);
    expect(sql.prepare('SELECT count(*) AS n FROM ae_cases').get()?.n).toBe(0);
    expect(sql.prepare('SELECT count(*) AS n FROM ae_audit').get()?.n).toBe(0);
  });
  it('creates a new case with attachment under real foreign key enforcement', async () => {
    expect((await request('POST', '', report('case1', { attachments: [photo] })))?.status).toBe(201);
    expect(sql.prepare('SELECT count(*) AS n FROM ae_attachments').get()?.n).toBe(1);
    const res = await request('GET', '/case1/attachments/photo1');
    expect(res?.status).toBe(200);
    expect(await res?.text()).toBe('hello');
    expect(sql.prepare('SELECT actor FROM ae_audit').get()?.actor).toBe('rep@example.test');
  });
  it('rolls back case and attachment metadata if audit insertion fails', async () => {
    sql.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON ae_audit BEGIN SELECT RAISE(ABORT, 'injected'); END");
    expect((await request('POST', '', report('case1', { attachments: [photo] })))?.status).toBe(500);
    expect(sql.prepare('SELECT count(*) AS n FROM ae_cases').get()?.n).toBe(0);
    expect(sql.prepare('SELECT count(*) AS n FROM ae_attachments').get()?.n).toBe(0);
  });
  it('does not overwrite committed attachment bytes when an update fails', async () => {
    await request('POST', '', report('case1', { attachments: [photo] }));
    sql.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON ae_audit BEGIN SELECT RAISE(ABORT, 'injected'); END");
    const changed = { ...photo, dataUrl: 'data:text/plain;base64,Y2hhbmdlZA==' };
    expect((await request('PATCH', '/case1', report('case1', { attachments: [changed], auditTrail: [{ action: 'update' }] }), 'pv@example.test'))?.status).toBe(500);
    expect(await (await request('GET', '/case1/attachments/photo1'))?.text()).toBe('hello');
  });
  it('rejects cross-case attachment id replacement', async () => {
    await request('POST', '', report('case1', { attachments: [photo] }));
    expect((await request('POST', '', report('case2', { attachments: [photo] }), 'other@example.test'))?.status).toBe(409);
    expect(sql.prepare('SELECT case_id FROM ae_attachments').get()?.case_id).toBe('case1');
  });
  it.each(['invalid', 'data:text/plain;base64,%%%'])('rejects malformed attachment instead of silently dropping it: %s', async (dataUrl) => {
    expect((await request('POST', '', report('case1', { attachments: [{ ...photo, dataUrl }] })))?.status).toBe(400);
    expect(sql.prepare('SELECT count(*) AS n FROM ae_cases').get()?.n).toBe(0);
  });
  it('rejects malformed report collections before mutation', async () => {
    expect((await request('POST', '', report('case1', { events: {} })))?.status).toBe(400);
  });
  it('keeps deletion and audit atomic and does not duplicate deletion audit', async () => {
    await request('POST', '', report());
    sql.exec("CREATE TRIGGER fail_delete_audit BEFORE INSERT ON ae_audit WHEN NEW.action='soft_deleted' BEGIN SELECT RAISE(ABORT, 'injected'); END");
    expect((await request('DELETE', '/case1', undefined, 'pv@example.test'))?.status).toBe(500);
    expect(sql.prepare('SELECT deleted_at FROM ae_cases').get()?.deleted_at).toBeNull();
    sql.exec('DROP TRIGGER fail_delete_audit');
    expect((await request('DELETE', '/case1', undefined, 'pv@example.test'))?.status).toBe(200);
    expect((await request('DELETE', '/case1', undefined, 'pv@example.test'))?.status).toBe(404);
    expect(sql.prepare("SELECT count(*) AS n FROM ae_audit WHERE action='soft_deleted'").get()?.n).toBe(1);
  });
  it('hides deleted cases and attachments from reps, retains PV inspection, rejects writes', async () => {
    await request('POST', '', report('case1', { attachments: [photo] }));
    await request('DELETE', '/case1', undefined, 'pv@example.test');
    expect((await request('GET', '/case1'))?.status).toBe(404);
    expect((await request('GET', '/case1/attachments/photo1'))?.status).toBe(404);
    expect((await request('GET', '/case1', undefined, 'pv@example.test'))?.status).toBe(200);
    expect((await request('PATCH', '/case1', report(), 'pv@example.test'))?.status).toBe(404);
    expect((await request('POST', '', report()))?.status).toBe(409);
  });
  it('does not reveal or overwrite another rep case', async () => {
    await request('POST', '', report());
    expect((await request('GET', '/case1', undefined, 'other@example.test'))?.status).toBe(404);
    expect((await request('POST', '', report(), 'other@example.test'))?.status).toBe(403);
  });
});
