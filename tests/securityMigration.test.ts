// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Keep the executable Node/SQLite proof in CI's normal Vitest discovery as
// well as allowing a dependency-free direct run during local incident repair.
describe('security and migration regressions', () => {
  // Spawns a child Node process that runs 71 SQLite assertions; on shared CI
  // runners this has taken 1.7s–9.6s. 5s (Vitest default) caused spurious
  // failures, so allow 30s. The assertion itself is unchanged and exact.
  it('passes the synthetic SQLite authorization/CAS/migration matrix', { timeout: 30_000 }, () => {
    const output = execFileSync(process.execPath, ['tests/securityMigration.regression.mjs'], {
      cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(output).toBe('PASS 71 SQLite security/migration assertions\n');
  });
});
