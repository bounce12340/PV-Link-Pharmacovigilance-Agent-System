-- Existing deployments: apply after worker/schema.sql. Safe to re-run.
ALTER TABLE ae_cases ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
