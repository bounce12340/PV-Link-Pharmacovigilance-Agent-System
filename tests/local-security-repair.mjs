import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { handleAeRequest } from '../worker/ae.js';

const root = resolve(new URL('..', import.meta.url).pathname);
const schema = readFileSync(join(root, 'worker/schema.sql'), 'utf8');
let assertions = 0;
function ok(condition, message) { assertions++; if (!condition) throw new Error(`assertion ${assertions}: ${message}`); }
function equal(actual, expected, message) { ok(actual === expected, `${message}; got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
function report(id, extra = {}) { return { id, caseNumber: id, status: 'submitted', reportType: 'initial', followUpOf: '', followUpOfId: '', hasSignificantNewInfo: false, reporterName: 'R', reporterPhone: '1', awarenessDate: '2026-09-28', reportDate: '2026-09-28', country: 'TW', patientInitials: 'P', patientAgeUnit: 'year', events: [], drugs: [], attachments: [], triage: {}, ...extra }; }
function makeApi(fixedClock = false) {
  const db = new DatabaseSync(':memory:'); db.exec(schema);
  const prepare = query => ({ bind: (...args) => ({ first: async () => db.prepare(query).get(...args) || null, all: async () => ({ results: db.prepare(query).all(...args) }), run: async () => ({ meta: db.prepare(query).run(...args) }) }) });
  const env = { AE_PV_EMAILS: 'pv@example.test', DB: { prepare, batch: async statements => { db.exec('BEGIN'); try { const results = []; for (const s of statements) results.push(await s.run()); db.exec('COMMIT'); return results; } catch (e) { db.exec('ROLLBACK'); throw e; } } }, AE_FILES: { put: async () => {}, get: async () => null } };
  const request = async (method, path, body, actor = 'rep@example.test') => { const url = new URL(`https://example.test/api/ae-reports${path}`); const response = await handleAeRequest(new Request(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env, url, { email: actor }, {}); return { status: response.status, body: await response.json() }; };
  return { db, request };
}

// 1. Existing rep POST must use the client token and cannot overwrite a PV same-status edit.
{
  const { db, request } = makeApi(); const original = report('stale', { events: [{ id: 'e', verbatim: 'rash', seriousnessCriteria: [] }] });
  equal((await request('POST', '', original)).status, 201, 'rep create');
  const pv = { ...original, caseNumber: 'PV-change', version: 0, triage: { notes: 'PV-only' }, events: [{ id: 'e', verbatim: 'rash', seriousnessCriteria: [], meddraPt: 'Rash', meddraSoc: 'Skin', meddraVerified: true }] };
  equal((await request('PATCH', '/stale', pv, 'pv@example.test')).status, 200, 'PV edit');
  equal((await request('POST', '', original)).status, 409, 'stale rep retry rejected');
  equal((await request('POST', '', { ...original, version: '1' })).status, 409, 'noninteger rep retry rejected');
  const row = db.prepare('SELECT case_number, version, payload FROM ae_cases WHERE id=?').get('stale');
  equal(row.case_number, 'PV-change', 'stale retry did not overwrite'); equal(row.version, 1, 'stale retry did not increment');
  // Same-version legitimate retry keeps PV-only fields instead of deleting them.
  const retry = { ...original, caseNumber: 'rep-legitimate-update', version: 1 };
  equal((await request('POST', '', retry)).status, 200, 'current rep retry accepted');
  const saved = JSON.parse(db.prepare('SELECT payload FROM ae_cases WHERE id=?').get('stale').payload);
  equal(saved.triage.notes, 'PV-only', 'rep retry preserves PV triage'); equal(saved.events[0].meddraPt, 'Rash', 'rep retry preserves MedDRA');
  db.close();
}

// 2. Direct rep POST retains valid clinical data but removes all PV-only and unknown nested data.
{
  const { db, request } = makeApi(); const injected = report('fields', { narrative: 'clinical narrative', unknownRoot: 'no', events: [{ id: 'e', verbatim: 'symptom', onsetDate: '2026-09-01', outcome: 'recovered', seriousnessCriteria: ['hospitalization'], meddraPt: 'Malicious PT', meddraSoc: 'Malicious SOC', meddraVerified: true, unknownEvent: 'no' }], drugs: [{ id: 'd', isSuspect: true, brandName: 'Drug', unknownDrug: 'no' }], triage: { notes: 'rep PV note', causality: 'certain' } });
  equal((await request('POST', '', injected)).status, 201, 'rep clinical create'); const saved = JSON.parse(db.prepare('SELECT payload FROM ae_cases WHERE id=?').get('fields').payload);
  equal(saved.narrative, 'clinical narrative', 'clinical narrative retained'); equal(saved.events[0].verbatim, 'symptom', 'clinical event retained'); equal(saved.events[0].meddraPt, undefined, 'MedDRA PT dropped'); equal(saved.events[0].meddraSoc, undefined, 'MedDRA SOC dropped'); equal(saved.events[0].meddraVerified, undefined, 'MedDRA verified dropped'); equal(saved.events[0].unknownEvent, undefined, 'unknown event dropped'); equal(saved.triage.notes, undefined, 'triage notes dropped'); equal(saved.unknownRoot, undefined, 'unknown root dropped'); equal(saved.drugs[0].unknownDrug, undefined, 'unknown drug dropped'); db.close();
}

// 3. Fixed same-millisecond stale write cannot pass UUID audit or metadata gates.
{
  const RealDate = globalThis.Date; const fixed = '2026-09-28T12:00:00.000Z';
  globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return new RealDate(fixed).getTime(); } };
  try { const { db, request } = makeApi(); const base = report('race'); equal((await request('POST', '', base, 'pv@example.test')).status, 201, 'race create'); equal((await request('PATCH', '/race', { ...base, version: 0, auditTrail: [{ action: 'legit' }] }, 'pv@example.test')).status, 200, 'race first update'); equal((await request('PATCH', '/race', { ...base, version: 0, auditTrail: [{ action: 'stale-audit' }] }, 'pv@example.test')).status, 409, 'race stale conflict'); const actions = db.prepare('SELECT action FROM ae_audit WHERE case_id=? ORDER BY seq').all('race').map(r => r.action); ok(!actions.includes('stale-audit'), 'stale audit absent in same millisecond'); equal(db.prepare('SELECT version FROM ae_cases WHERE id=?').get('race').version, 1, 'race version stays one'); db.close(); } finally { globalThis.Date = RealDate; }
}

// 4. Audit/attachment metadata rollback is a true SQLite transaction, not an optimistic response check.
{
  const { db, request } = makeApi(); equal((await request('POST', '', report('rollback'))).status, 201, 'rollback create'); db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON ae_audit WHEN NEW.action='rollback-test' BEGIN SELECT RAISE(ABORT, 'injected'); END"); const res = await request('PATCH', '/rollback', report('rollback', { version: 0, auditTrail: [{ action: 'rollback-test' }] }), 'pv@example.test'); equal(res.status, 500, 'audit SQL failure surfaces'); equal(db.prepare('SELECT version FROM ae_cases WHERE id=?').get('rollback').version, 0, 'case update rolled back'); equal(db.prepare("SELECT count(*) n FROM ae_audit WHERE action='rollback-test'").get().n, 0, 'failed audit absent'); db.close();
}

// 5. Migration runner matrix: fresh skips ALTER, legacy upgrades once, rerun uses ledger.
{
  const dir = mkdtempSync(join(tmpdir(), 'pv-migration-')); const runner = join(root, 'worker/migrations/run-local.mjs');
  const run = path => execFileSync(process.execPath, [runner, path], { stdio: 'pipe' });
  try {
    const fresh = join(dir, 'fresh.db'); const f = new DatabaseSync(fresh); f.exec(schema); f.close(); run(fresh); const freshDb = new DatabaseSync(fresh); ok(freshDb.prepare("SELECT id FROM schema_migrations WHERE id='002_case_version'").get(), 'fresh 002 ledger recorded'); ok(freshDb.prepare("SELECT id FROM schema_migrations WHERE id='004_case_mutation_token'").get(), 'fresh 004 ledger recorded'); equal(freshDb.prepare("SELECT count(*) n FROM pragma_table_info('ae_cases') WHERE name='version'").get().n, 1, 'fresh has one version'); equal(freshDb.prepare("SELECT count(*) n FROM pragma_table_info('ae_cases') WHERE name='last_mutation_id'").get().n, 1, 'fresh has one mutation token'); freshDb.close(); run(fresh);
    const legacy = join(dir, 'legacy.db'); const l = new DatabaseSync(legacy); l.exec(schema.replace(/\n  -- Request-unique token[\s\S]*?last_mutation_id  TEXT,/, '').replace(/\n  version           INTEGER NOT NULL DEFAULT 0,/, '')); l.close(); run(legacy); const legacyDb = new DatabaseSync(legacy); equal(legacyDb.prepare("SELECT count(*) n FROM pragma_table_info('ae_cases') WHERE name='version'").get().n, 1, 'legacy upgraded version'); equal(legacyDb.prepare("SELECT count(*) n FROM pragma_table_info('ae_cases') WHERE name='last_mutation_id'").get().n, 1, 'legacy upgraded mutation token'); ok(legacyDb.prepare("SELECT id FROM schema_migrations WHERE id='002_case_version'").get(), 'legacy 002 ledger recorded'); ok(legacyDb.prepare("SELECT id FROM schema_migrations WHERE id='004_case_mutation_token'").get(), 'legacy 004 ledger recorded'); legacyDb.close(); run(legacy);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
console.log(`PASS ${assertions} SQLite security assertions`);
