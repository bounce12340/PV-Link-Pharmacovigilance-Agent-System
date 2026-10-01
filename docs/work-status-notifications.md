# 工作狀態、今日／本週工作台與站內提醒

## 範圍與操作

此切片僅新增 PV 內部工作 aggregate 的 `todo`、`in-progress`、`waiting`、`completed`、`cancelled` 五種狀態；絕不寫入或推導 regulatory case `status`、Day 0、法規 deadline 或送件流程。工作台固定採 `Asia/Taipei`：週一 00:00（含）至下週一 00:00（不含）；到期當天不逾期。今日／本週／逾期只顯示未完成狀態，完成與取消永不列入待辦／逾期。

PV 展開工作台後選擇「今日／本週／逾期」；遠端模式以 `GET /api/ae-reports/workbench?scope=` 取得單一分頁批次結果（上限 100），不再依已載個案逐案 GET。回應明確提供 `timezone`、`today`、週界及查詢半開範圍。工作編輯使用既有版本號；409 時保留草稿，不自動重試。切換範圍及離頁均阻擋未儲存編輯。

完成／取消／重開必須經 Worker：由未完成狀態才可完成或取消；取消必填 1–500 字原因；terminal 狀態只可明確重開到未完成狀態。完成／取消 actor 與時間一律由伺服器建立，重開時清除 current lifecycle metadata。每次條件式版本寫入與 immutable `ae_work_audit` trigger 在同一 SQLite transaction，audit action 為 `work_completed`、`work_cancelled`、`work_reopened` 或 `work_saved`。

## 提醒與隱私

提醒端點均 PV-only，且角色檢查在任何資料庫查詢前：

- `GET /api/ae-reports/notifications?limit=…` 僅回目前驗證 actor 的固定 DTO：id、kind、內部 caseId、createdAt、readAt。
- `POST /api/ae-reports/notifications/read` 僅以 `recipient = verified actor` 更新其 own notification，無法標示他人通知已讀。
- `work_assigned` 在工作寫入的同一 SQLite trigger/transaction 建立給新 assignee（不通知操作者）；`work_due` 在 workbench 載入時，以一個 bounded JOIN scan 補建。
- `UNIQUE(recipient, dedupe_key)` 使 assignment version／recipient 和 due case／due-date 去重，重整及並發頁載入不重複。

固定 UI 文案只說「內部工作已分派／到期或逾期」，不含病患姓名、縮寫、事件、藥物、next action、聯絡內容或取消原因。因掃描 JOIN `ae_cases.deleted_at IS NULL`，已刪個案不會新建 due 通知；既有通知 API 仍需在正式資料保留／刪案政策定義前評估清理策略。UI 明示「僅於開啟／重新整理工作台時更新」，沒有 cron、背景 push、email 或即時保證。

## Schema 與遷移

- Fresh、legacy 與正常 rerun 一律以 `node worker/migrations/run-local.mjs /path/to/database.sqlite` 做**本機 SQLite**受控 preflight；runner 先以隔離 in-memory reference schema 核對既有 tables、columns、constraints、indexes 及 triggers 的定義，才會在一筆 transaction 內執行或補記 ledger。它不接觸 D1、Wrangler、R2 或任何遠端服務。
- 若 ledger 已有但定義（包含 `schema_migrations` table definition）不符，或 ledger 缺少而偵測到 partial/drifted footprint，runner fail closed：不假成功、不自修、不 drop table、不清資料，並且全域 preflight 在寫入任一 ledger 前完成。003 合法覆蓋 001 的 `ae_work_created`／`ae_work_updated` triggers 是明確允許的已驗證狀態；僅同名不算完成。
- 遠端 migration、備份與部署不在本次實作中執行。SQLite 合成驗證不是 D1／staging／production migration 放行證據；任何遠端變更仍須經授權的部署程序及獨立複核。
- 回滾先回滾程式，保留狀態、提醒與不可變 audit 表資料；不可刪表。舊 `ae_case_work.payload` 沒有 status 時讀取預設 `todo`，不根據空 nextAction／空 due／items 或 regulatory status 猜測完成。

## 已完成的本機驗證與限制

- `node --check worker/work.js worker/ae.js worker/migrations/run-local.mjs tests/securityMigration.regression.mjs`、`git diff --check` 與直接 `node tests/securityMigration.regression.mjs`：成功（71 個合成 SQLite assertions）。
- 獨立驗收曾以相同 lockfile 的完整依賴鏡像直接執行 TypeScript compiler `tsc --noEmit` 成功；本隔離修補樹沒有 `node_modules`，本輪未重新執行 TypeScript。標準 Vitest 仍受 iSH `uv_thread_create`／fork IPC 環境限制，Vite production build 仍受 resolver `realpath` 限制；均未重複排障，亦未聲稱正式 runner 通過。
- 71 個直接回歸包含 legacy/fresh/rerun、definition drift（trigger/index/column/constraint）、全域 preflight 不寫 ledger、rep DB-before authorization、PV authorized read、server-owned lifecycle/assignee 零寫入、AE POST internal fields 零 persistence、items/contacts primitive 型別，以及既有 work status/lifecycle 契約。`securityMigration.test.ts` 為正式 Vitest discovery wrapper，精確 gate `PASS 71`，但該 wrapper 本輪未在 Vitest runner 執行。
- 未驗證 Cloudflare D1 `batch`、Access policy、真實多請求併發、瀏覽器互動或 migration 升級於正式／staging；不得據此宣稱可部署或可上線。

## 實際驗證與證據

- 本修補 SHA 的實際本機證據：repo 內 `node tests/securityMigration.regression.mjs`（68 assertions）、syntax checks、`git diff --check`；repo 外 definition-drift probe 同時證明基底接受同名錯 trigger/index，而本修補拒絕。證據目錄：`/var/minis/workspace/pv-migration-definition-fix-evidence/`。
- TypeScript：獨立驗收對基底 `adb542c` 使用相同 lockfile 的完整依賴鏡像直接 `tsc --noEmit` 成功；本隔離修補樹無 `node_modules`，本輪未重跑，故不把基底的 typecheck 當成本 SHA 通過。
- Vitest/Vite：本 iSH 的正式 Vitest runner 仍因 `uv_thread_create`／fork IPC，Vite build 因 resolver `realpath` 環境限制未完成；本輪未重複排障，未聲稱通過。舊 SHA／舊 CI run 不作本修補 SHA 的最終證據。

未驗證 Cloudflare D1 `batch`、Access policy、真實多請求併發、瀏覽器互動或 migration 升級於正式／staging；不得據此宣稱可部署或可上線。
