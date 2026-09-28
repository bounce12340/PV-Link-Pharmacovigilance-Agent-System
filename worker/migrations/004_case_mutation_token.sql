-- Existing databases only. Do NOT run after schema.sql on a fresh database.
-- The controlled runner checks PRAGMA table_info and schema_migrations before executing.
-- This SQL is intentionally not self-rerunnable: SQLite has no portable ADD COLUMN IF NOT EXISTS.
ALTER TABLE ae_cases ADD COLUMN last_mutation_id TEXT;
