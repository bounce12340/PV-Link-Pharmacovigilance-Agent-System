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

- Fresh DB：套用 `worker/schema.sql`（已含 `ae_cases.version`），再套 `worker/migrations/001_case_work.sql`、`003_work_status_notifications.sql`；**不得**對 fresh schema 重跑 `002_case_version.sql`。
- Upgrade：須先依既有受控流程確認 case-version migration 與 `001` 已成功，備份後只執行一次 `003_work_status_notifications.sql`，再部署相容 Worker/UI。003 使用 SQLite `ALTER TABLE ADD COLUMN`，**不可重跑**；遠端 migration 及部署不在本次實作中執行。現有 migration ledger/schema 不一致會靜默成功的基底 blocker 尚未修復，因此本文件的 SQLite 合成驗證不能作為遠端 migration 放行證據。
- 回滾先回滾程式，保留狀態、提醒與不可變 audit 表資料；不可刪表。舊 `ae_case_work.payload` 沒有 status 時讀取預設 `todo`，不根據空 nextAction／空 due／items 或 regulatory status 猜測完成。

## 已完成的本機驗證與限制

- `node node_modules/typescript/bin/tsc --noEmit`、`node --check worker/work.js worker/ae.js services/caseWorkModel.js`、`git diff --check`：成功。
- 執行指定 Vitest work tests 時，Vitest/Vite 即使經 `ESBUILD_BINARY_PATH` 避開本機 package binary `EACCES`，仍因 iSH 的 worker thread／fork IPC 限制停止；未聲稱 Vitest 通過，沒有反覆排障。
- 新增回歸測試涵蓋 legacy todo、未知狀態／日期／偽造 lifecycle 拒絕、轉移矩陣、Taipei 跨 UTC 週界、terminal 排除、PV 早拒絕、server actor/time 與 CAS；SQLite 整合測試另涵蓋 status／reopen、actor-bound workbench 與 recipient-isolated notification read。工作項目與聯絡紀錄既有編輯控制項仍保留。由於上述 iSH runner 限制，這些 Vitest 測試仍待一般 Node/CI 執行。
- 未驗證 Cloudflare D1 `batch`、Access policy、真實多請求併發、瀏覽器互動或 migration 升級於正式／staging；不得據此宣稱可部署或可上線。

## 證據

本輪不執行 remote migration、deploy、PR、merge、push 或 Actions dispatch。CI evidence 需在獲重新授權 push/dispatch 後，保存至 `/var/minis/workspace/pv-workflow-evidence/`，並記錄 Node 22／24 測試數與 build 結果。
