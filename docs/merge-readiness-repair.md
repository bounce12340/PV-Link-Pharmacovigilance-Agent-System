# 合併就緒修補紀錄

- **基底 SHA：** `6fa1508b4a68977ca2e2f23c463dd397dcfaefed`
- **修補分支：** `fix/merge-readiness-security-migrations-6fa1508`
- **範圍：** 本機程式與合成 SQLite 驗證；沒有 push、PR、merge、部署、遠端 D1/R2、寄信或正式資料操作。

## 已修補的合併阻擋

1. **rep POST 的 CAS 與 outbox。** 已存在個案的 rep POST 必須提交嚴格、安全整數且非負的 client `version`；缺失、字串或過期 token 均回 409，不再用資料庫最新版覆寫。新 id 以 `INSERT OR IGNORE` 處理競態碰撞，零寫入即 409。成功回應提供實際 `version`，前端保存它。409 會把原 payload 標為 `outboxConflict`、保留並停止有序重送；畫面明示「尚未送達」。
2. **rep 欄位級授權與資料保全。** `sanitizeRepReport()` 由 `AEReport` 的 reporter/clinical contract 白名單重建 root、events、drugs；PV triage、MedDRA 與未知欄位不落盤。保留合法 `primaryReporterConsentFollowUp` true/false。既存 retry 對已編碼 event 保守：不可刪除、改 id 或改變原始描述／日期／outcome／嚴重性；相同 id 的 MedDRA 保留。event id 必須唯一。
3. **case mutation token。** `ae_cases.last_mutation_id` 為伺服器 UUID；case 寫入、audit 與每個新增附件 metadata 都用同一 token 的 SQL `EXISTS` gate。DELETE 亦同。這不依賴時間戳精度；SQLite transaction 失敗會回滾 DB case/audit/metadata。R2 先 put 後 SQL 失敗可能留下 orphan object，仍是已知剩餘風險，未嘗試清遠端。
4. **001–004 受控本機 migration runner。** 新增 `004_case_mutation_token.sql`，將 001/002/003/004 納入 `schema_migrations` ledger 加實際 schema preflight。ledger 有而 schema 缺、或 ledger 缺且 migration footprint 部分存在，均 fail closed、保留資料；fresh 完整 schema 只補 ledger，legacy 空 footprint 才於 transaction 執行 SQL。001 驗證 tables/triggers，003 驗證 columns/indexes/tables/triggers，非只驗欄位。runner 明確僅供本機 SQLite；不是 D1 部署工具。

## 本機實測證據

於此修補 commit 前，Node `v22.23.2` 已實跑：

```text
node --check worker/ae.js
node --check worker/migrations/run-local.mjs
node --check tests/securityMigration.regression.mjs
node tests/securityMigration.regression.mjs
PASS 30 SQLite security/migration assertions
```

37 項包含：rep MedDRA/triage 注入拒絕、合法 consent 保留、stale/缺失/非整數 version、coded event delete/rename 拒絕、同毫秒 stale audit／attachment metadata 不殘留、注入 audit DB failure 的 case/audit/metadata rollback、fresh/legacy/rerun ledger、001/003 trigger/index/table 驗證、ledger/schema 反向矛盾與 partial schema fail closed。`tests/securityMigration.test.ts` 將同一個可直接執行的合成測試納入 Vitest discovery，供正式 CI 執行。

`git diff --check` 與 JavaScript syntax check 應在最終 commit 前再執行並以該 commit SHA 記錄。

## 尚未驗證／剩餘風險

- 本機 SQLite 不是 Cloudflare D1：未驗證 D1 `batch()` 原子性、`meta.changes`、trigger 與真實並發；未做 staging/production 或 remote migration。
- 未執行正式 Vitest/typecheck/build：本隔離 worktree 用主 worktree 的既有 dependencies 嘗試 Vitest 時，esbuild binary `EACCES`，不能將 adapter/SQLite 說成完整 Vitest。正式 CI 應執行 `npm test`、`npm run typecheck`、`npm run build`。
- R2 object 在 SQL 交易失敗後可能成為 orphan；依本次界線未存取或清理 R2。
- conflict UX 保存且停止重送，但尚無自動 reload/merge workflow；使用者需明確重新載入後處理。

## 建議合併前後續

1. 在正常 Node/CI runner 執行完整 Vitest、typecheck、build（含本次新增 test）。
2. 經明確授權後，以無敏感資料的 D1 staging 驗證 transaction/batch、triggers 與 migration preflight；不可把本 runner 當 remote migration 工具。
3. 獨立審查本次 diff，特別確認 D1 SQL `INSERT OR IGNORE` / `batch` 契約與 rep retry 的保守 event immutability 是否符合產品流程。
