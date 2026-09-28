# 本機四項安全／migration 修補紀錄

- **範圍與基底：** 僅處理 `5deb529ff49e69fcedfaddd866f425812a8ad5d6` 的四個經獨立複查確認之阻擋項；未讀取秘密，未連線 remote D1，未部署、push、PR、merge、dispatch CI 或寄信。
- **隔離工作樹：** `/var/minis/workspace/pv-local-security-repair-5deb529`
- **分支：** `fix/local-security-four-blockers-5deb529`
- **本機 commits：** `9d06ed426d0b1025ac37074f4d5ab5a565a06d4f`、`ec83c579450e34ec588979c46926d3db29568d79`、`855ecf4cd5a460e8cd8054d9fff83cd2f1faceea`、`d8b458f5df7038c676a3dc99bd961d63e96e72b0`（HEAD）。未 cherry-pick 至主 repo。

## 缺陷基線重現

以 Node `v22.23.2`、`node:sqlite` in-memory 合成 DB，原始固定 SHA 的三個提供 PoC 已重新執行，輸出在 repo 外 `baseline-pocs.log`：

1. rep create (201) → PV 在同為 submitted 的案子 PATCH 至 version 1 → 舊 rep payload POST 仍回 201，將 `case_number` 覆寫、version 變 2。
2. rep 直接 POST 帶 MedDRA PT/SOC/verified 與 `triage.notes`，均被持久化。
3. 固定同一毫秒時，第一次 PV PATCH 成功、第二次 stale PATCH 回 409，但仍插入 `stale-audit`。

## 實作修補

### 1. rep 既存 POST 的版本契約

- 新案可省略 `version`，仍是 INSERT/201/version 0。
- 既存 id 的 rep POST 僅限同 owner 且 `draft`/`submitted`，並必須帶先前 GET／成功 POST 回傳的非負安全整數版本；遺漏、字串、NaN、過期都回 409。
- 不再讀取資料庫最新版本代替 client token。合法重送回 200 及實際新增 version。
- `services/aeApi.ts` 保留 POST 成功回傳的 version；409 在 outbox 保留供 reload/reconcile，但標記為 conflict，`flushOutbox` 不會自動重送。

### 2. rep payload allowlist 與 PV 資料保全

- `sanitizeRepReport()` 以 root、`events[]`、`drugs[]` allowlist 重建 payload；保留完整臨床／通報 AEReport 欄位與附件（附件另受既有 byte/reference 檢查）。
- 不持久化未知 root/nested key、`events[].meddraPt`、`meddraSoc`、`meddraVerified`，以及完整 `triage`（包括 `triage.notes`）。PV PATCH 不受此限制；未改任何法規時計算。
- 合法既存 rep retry 會保留 DB 中 PV `triage`，且按相同 event id 保留既有 MedDRA 欄位，避免舊 rep payload 清除後台資料。

### 3. audit / attachment metadata 精確綁定成功 mutation

- `ae_cases.last_mutation_id` 是 server 端 `crypto.randomUUID()`，不採 timestamp/version。
- 每個 INSERT、條件 UPDATE、DELETE 寫入同一 UUID；同 batch 內 audit 與附件 metadata 的 `INSERT ... SELECT` 僅匹配同一 case id + UUID。
- 因此 stale conditional update 即使與其他成功 update 同毫秒／同 version，也無法滿足自己的 audit/metadata gate。SQL batch 失敗會交易回滾。
- DELETE 亦改為 UUID gate；所有已辨識寫入路徑已檢視，未擴張其他功能。

### 4. 002 fresh / upgrade / re-run 規範

- `schema.sql` 明確為 fresh 最新 schema，已含 `version` 和 `last_mutation_id`。
- `002_case_version.sql` 限於 legacy 缺 `version` DB；新增 `004_case_mutation_token.sql` 限於 legacy 缺 `last_mutation_id` DB。兩個 SQL 均明示不可直接重跑。
- 新增 `worker/migrations/run-local.mjs`：本機 SQLite 專用、無網路/無 Wrangler。以 `schema_migrations` ledger + `PRAGMA table_info` 預檢；fresh schema 記錄 ledger 但跳過 ALTER，legacy 依序套用 002/004，再跑則由 ledger 跳過。
- 已同步 `docs/security-hardening.md`、`docs/deployment-ae-backend.md`、`docs/case-work-management.md`；未操作 remote migration。

## 實際驗證

| 類別 | 結果 | 證據 |
|---|---|---|
| 提供的三個 baseline PoC（固定 5deb529） | 預期失敗，成功重現三個 exploit | `baseline-pocs.log` |
| 新增 SQLite adapter | **PASS：37 assertions** | `local-security-repair.log` |
| Adapter 覆蓋 | stale/缺/字串 version 409、合法 retry/PV 資料保留、rep MedDRA/triage/unknown 移除、固定同毫秒 stale audit 不插入、audit SQL failure 時 case/audit/**新附件 metadata** 回滾、fresh/legacy/rerun ledger matrix | `local-security-repair.log`；`tests/local-security-repair.mjs` |
| 正式 Vitest 回歸檔 | 已新增 4 個 regression cases 至 `tests/worker.integration.test.ts` | 靜態檢查；原生 Vitest 見下列限制 |
| JavaScript syntax | PASS：`node --check worker/ae.js`、runner、adapter | `precommit-review.log` / shell logs |
| diff whitespace | PASS：`git diff --check`（提交前） | `precommit-review.log` |
| 原生 Vitest | **未執行**；isolated worktree 無 `node_modules`，`npm test` 退出 127 (`vitest: not found`) | `vitest-attempt.log` |
| TypeScript | **未完成**；worktree 無 dependencies，嘗試 symlink 主 repo `node_modules` 被 filesystem 拒絕；未安裝/升級依賴、未重複排障 | `typecheck.log` 與執行輸出 |
| Cloudflare D1 / staging / production | **未執行** | 無 remote 操作 |

註：adapter 的故意觸發 audit trigger 會由 API 記錄 `ae api error: Error: injected`，隨後斷言 500 與 case/audit/attachment metadata rollback；這是預期測試路徑，PASS 37 為最後結果。

## 修改檔案

- `worker/ae.js`
- `worker/schema.sql`
- `worker/migrations/002_case_version.sql`
- `worker/migrations/004_case_mutation_token.sql`（新增）
- `worker/migrations/run-local.mjs`（新增，本機專用）
- `services/aeApi.ts`
- `tests/worker.integration.test.ts`
- `tests/local-security-repair.mjs`（新增 Node SQLite adapter）
- `docs/security-hardening.md`
- `docs/deployment-ae-backend.md`
- `docs/case-work-management.md`

## 未驗證與剩餘風險

1. SQLite adapter 的 batch transaction/UUID SQL 行為不是 Cloudflare D1 平台保證；應在授權的 staging D1、合成個案驗證條件寫入 0 changes、多附件、audit、DELETE 與 rollback。
2. 現有 R2 仍先 put 再 SQL；DB conflict/失敗不會留下 metadata，但可能留下孤兒 R2 object。此輪未擴張至補償刪除或 lifecycle/reconciliation。
3. 真實瀏覽器 IndexedDB/outbox reconcile UI 與原生 Vitest/TypeScript/完整 CI 未驗證。409 不再自動重送，但 UI 尚未提供完整人工 merge/reload workflow；outbox item 會保留並停止 flush。
4. 004 是 schema 新欄位所需的新增 migration；遠端執行前必須在受控流程備份、PRAGMA/ledger 預檢，且不能只套用 002。

## 建議下一步

在保持主 repo 草稿不動的前提下，由另一位複查者在此獨立 branch：先供應一般 Node/CI dependencies 執行 Vitest、TypeScript、build；再於獲准 staging D1 的合成資料執行 migration matrix 與 UUID-gated batch 語意。通過後再由主代理選擇 cherry-pick **整個 series**（`9d06ed4`、`ec83c57`、`855ecf4`、`d8b458f`，或由 HEAD 建立乾淨整體合併）；不可直接套用於髒主工作樹。
