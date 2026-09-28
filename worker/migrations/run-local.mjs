#!/usr/bin/env node
/**
 * Local SQLite migration runner for controlled upgrade validation only.
 * No network, Wrangler, remote D1, or production credentials are used here.
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
const migrations = [
  { id: '002_case_version', file: resolve(here, '002_case_version.sql'), requires: { table: 'ae_cases', missingColumn: 'version' } },
  { id: '004_case_mutation_token', file: resolve(here, '004_case_mutation_token.sql'), requires: { table: 'ae_cases', missingColumn: 'last_mutation_id' } },
];
const db = new DatabaseSync(resolve(target));
try {
  db.exec('PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = db.prepare('SELECT id FROM schema_migrations WHERE id=?');
  const columns = table => db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
  for (const migration of migrations) {
    if (applied.get(migration.id)) continue;
    if (!columns(migration.requires.table).length) throw new Error(`${migration.id}: prerequisite table ${migration.requires.table} is missing`);
    if (columns(migration.requires.table).includes(migration.requires.missingColumn)) {
      // Fresh schema already contains the column; record the migration without running ALTER.
      db.prepare('INSERT INTO schema_migrations(id, applied_at) VALUES(?, ?)').run(migration.id, new Date().toISOString());
      continue;
    }
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(migration.file, 'utf8'));
      db.prepare('INSERT INTO schema_migrations(id, applied_at) VALUES(?, ?)').run(migration.id, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
} finally {
  db.close();
}
