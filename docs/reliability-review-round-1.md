# Reliability review — round 1

Date: 2026-09-28
Branch: `improve/reliability-review`
Scope: local review and one local commit only; no push, deployment, production requests or secret access.

## Changes reviewed and completed

- AE case writes and single-value writes (including draft/outbox) propagate failure when both IndexedDB and localStorage fail. Literature-array writes retain the existing best-effort contract. IndexedDB write/delete abort handlers settle the promise instead of hanging.
- Case mutation, attachment metadata and audit inserts use one D1 batch, with the parent case first to satisfy foreign keys. Soft deletion and its audit insert also share a batch; `changes()` prevents duplicate deletion audit entries.
- R2 uploads use unique object keys so a failed SQL update cannot overwrite a committed attachment's bytes. Attachment upsert preserves original attribution; cross-case attachment IDs are rejected, with a NOT NULL constraint guard for a conflicting owner at SQL execution time.
- Malformed attachment encoding and report collection shapes are rejected. Review additionally rejects null/non-object attachment entries. List limits are finite positive bounded integers.
- JWT verification requires RS256/key ID, finite unexpired `exp`, exact issuer and matching audience; optional `nbf` must be finite and not in the future. Partial Access configuration fails closed.
- Reps cannot read deleted cases or their attachments. PV may inspect deleted records, but sequential POST/PATCH cannot revive them.
- Added three regression files: storage (4 cases), JWT (15 parameter-expanded cases), real SQLite/Worker integration (13 cases), total **32 intended Vitest cases**. Review added audience/null-claim coverage, successful same-case attachment update, invalid attachment element and R2 upload failure checks.

## Actual validation results

| Check | Result |
| --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS, exit 0 on final tree |
| `node --check worker/ae.js` | PASS, exit 0 |
| `node --check worker/index.js` | PASS, exit 0 |
| `git diff --check` | PASS, exit 0 before report commit |
| `node node_modules/vitest/vitest.mjs run` | BLOCKED before test collection: native esbuild spawn EACCES; chmod did not fix it |
| `node node_modules/vite/bin/vite.js build` | BLOCKED loading config: native esbuild spawn EACCES |
| Config-runner/transpiled-copy Vitest workaround | BLOCKED by bridge realpath ENOENT; not a passing Vitest run |
| Standalone Node assertion adapter, initial inherited Worker integration tests | 10/10 passed against actual schema/SQLite with foreign keys and transaction rollback |
| Standalone Node assertion adapter, initial inherited JWT tests | 12/12 passed using generated RSA keys and mocked JWKS; no external authentication traffic |
| Standalone storage assertions | 5/5 passed: fallback round trip, outbox failure, case failure, legacy literature best-effort behavior, abort fallback |

The **27 standalone checks are not Vitest results**. They validated the inherited patch before the final additional test cases and null-attachment guard. Attempts to rerun the expanded tests encountered inconsistent bridge file writes, stale transpiled output and finally empty generated modules (0/0); those attempts are explicitly **not** counted as passing checks. Final additional cases remain unexecuted. Temporary adapters/copies were removed from the repository. The complete original test suite, DOM submission test and production build remain unverified.

Environment: `/usr/bin/node`, Node v22.23.2, linux arm64 reported by Node; npm present. Direct TypeScript entry works. Node native SQLite works (experimental warning). Executable wrappers/native esbuild, realpath and generated-file behavior are unreliable in this iOS/iSH bridge. No dependency reinstall, package changes or lockfile changes were needed.

## SQL and compatibility findings

The initial standalone integration run exercised actual `worker/schema.sql`, INSERT/UPDATE/UPSERT, FK ordering, audit-trigger rollback, failed attachment update retaining old bytes, cross-case ID rejection, repeated deletion and rep/PV access. The adapter uses an explicit SQLite transaction to model D1 batch atomicity; it is not a Cloudflare D1 runtime test. `changes()` worked across consecutive statements in this transaction. Its D1 batch behavior still requires runtime confirmation.

`submitAEReport` already catches local-save and outbox-write errors and returns a failure message, so storage error propagation restores that existing contract. `saveAECase` and `flushOutbox` now correctly reject failed persistence instead of reporting success. No API response shape, schema migration, dependency or deployment configuration was changed.

## Remaining risks / next validation

1. Run `npm run typecheck`, `npm test`, `npm run build` on standard Node **22.13+** (the new integration tests import `node:sqlite`). Confirm all 32 new cases plus the original suite, then test D1 batch and R2 behavior in an authorized non-production environment.
2. R2 and D1 are not one distributed transaction. Failed batches or successful replacement uploads can leave unreferenced objects; no cleanup/lifecycle policy is added here. Never blindly delete old blobs that may be referenced by committed metadata.
3. Authorization/deleted-state reads occur before mutation. Concurrent writes/deletion and stale client updates still need a separate conditional-write/optimistic-locking design. This round only establishes SQL batch atomicity and sequential deletion checks.
4. Existing read policy prefers IndexedDB. A write that falls back to localStorage while IndexedDB reads still succeed may later expose stale IDB data; cross-store reconciliation is not solved by this patch.
5. Audit entries remain client-supplied action/detail/time with server-attributed actor, and full-trail resubmission can duplicate audit entries. This round does not introduce event IDs/idempotency or server-only audit semantics.
6. Browser/real-device storage behavior, UI handling of rejected draft saves, remote retry behavior and deployment authentication policies have not been end-to-end verified. SQLite mocks and generated JWTs are not production security certification.
