#!/usr/bin/env node
/**
 * Local SQLite migration preflight/runner for synthetic validation only.
 * It never contacts D1, Wrangler, R2, or any remote service.
 *
 * Usage: node worker/migrations/run-local.mjs /path/to/database.sqlite
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target) throw new Error('usage: node worker/migrations/run-local.mjs /path/to/database.sqlite');
const here = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(resolve(target));
const migrations = [
  { id: '001_case_work', file: '001_case_work.sql', required: [
    ['table', 'ae_case_work'], ['table', 'ae_work_audit'],
    ['trigger', 'ae_work_audit_no_update'], ['trigger', 'ae_work_audit_no_delete'],
    ['trigger', 'ae_work_created'], ['trigger', 'ae_work_updated'],
  ], footprints: [['table', 'ae_case_work'], ['table', 'ae_work_audit'], ['trigger', 'ae_work_audit_no_update'], ['trigger', 'ae_work_audit_no_delete'], ['trigger', 'ae_work_created'], ['trigger', 'ae_work_updated']] },
  { id: '002_case_version', file: '002_case_version.sql', required: [['column', 'ae_cases', 'version']], footprints: [['column', 'ae_cases', 'version']] },
  { id: '003_work_status_notifications', file: '003_work_status_notifications.sql', required: [
    ['column', 'ae_case_work', 'status'], ['column', 'ae_case_work', 'assignee'], ['column', 'ae_case_work', 'work_due_date'], ['column', 'ae_case_work', 'audit_action'],
    ['index', 'idx_ae_case_work_workbench'], ['table', 'ae_notifications'], ['index', 'idx_ae_notifications_recipient'],
    ['trigger', 'ae_work_created'], ['trigger', 'ae_work_updated'], ['trigger', 'ae_work_assignment_notification_insert'], ['trigger', 'ae_work_assignment_notification_update'],
  ], footprints: [
    ['column', 'ae_case_work', 'status'], ['column', 'ae_case_work', 'assignee'], ['column', 'ae_case_work', 'work_due_date'], ['column', 'ae_case_work', 'audit_action'],
    ['index', 'idx_ae_case_work_workbench'], ['table', 'ae_notifications'], ['index', 'idx_ae_notifications_recipient'],
    ['trigger', 'ae_work_assignment_notification_insert'], ['trigger', 'ae_work_assignment_notification_update'],
  ] },
  { id: '004_case_mutation_token', file: '004_case_mutation_token.sql', required: [['column', 'ae_cases', 'last_mutation_id']], footprints: [['column', 'ae_cases', 'last_mutation_id']] },
];
const objectExists = (type, name) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type=? AND name=?").get(type, name));
const columnExists = (table, name) => db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === name);
const exists = ([kind, a, b]) => kind === 'column' ? columnExists(a, b) : objectExists(kind, a);
const applied = id => Boolean(db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id));
const record = id => db.prepare('INSERT INTO schema_migrations(id, applied_at) VALUES(?, ?)').run(id, new Date().toISOString());
try {
  db.exec('PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  if (!objectExists('table', 'ae_cases')) throw new Error('preflight: ae_cases is missing; refuse to infer a schema');
  for (const migration of migrations) {
    const complete = migration.required.every(exists);
    const footprintCount = migration.footprints.filter(exists).length;
    const ledger = applied(migration.id);
    if (ledger && !complete) throw new Error(`${migration.id}: ledger says applied but required schema is missing (fail closed)`);
    if (ledger) continue;
    if (complete) { record(migration.id); continue; } // actual schema proves an unrecorded prior migration
    if (footprintCount) throw new Error(`${migration.id}: partial schema without ledger (fail closed; preserve data)`);
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(resolve(here, migration.file), 'utf8'));
      if (!migration.required.every(exists)) throw new Error(`${migration.id}: SQL completed without all required schema objects`);
      record(migration.id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
} finally {
  db.close();
}
