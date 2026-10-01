# 個案工作管理第一版

## 操作

PV 收案處理台右側頂端展開「個案分派與待辦工作台」，選擇個案後可設定負責人、下一步及**內部工作到期日**。提供全部、我的待辦、未分派、內部逾期篩選。新增補件項目後填寫名稱並選擇待取得／已取得／取消；聯絡紀錄包含日期、電話／電子郵件／拜訪／其他、結果及下次追蹤日期。按「儲存工作」才提交。

此版以清空下一步及工作到期日表示目前工作完成；不改法規 deadline、Day 0、嚴重性或任何法規規則，不寄信，不建立 regulatory follow-up case。下次追蹤日期是聯絡紀錄，不自動改工作到期日。我的待辦是依負責人篩選；內部逾期只依工作到期日，當日不算逾期。

錯誤不清除編輯內容。409 表示版本衝突：先複製需要保留的內容，再按「放棄編輯並重新載入」，重填後儲存；不自動覆蓋或重試。未儲存時阻止在工作台切換個案，並註冊離頁警告。離開整個 App 分頁造成元件卸載仍可能失去未儲存草稿，請先儲存。

## 架構與安全邊界

- `services/caseWorkModel.js`：共用嚴格 schema、長度／日期／狀態／清單數量驗證、篩選。補件最多 50、聯絡最多 100；下一步及聯絡結果最多 1000 字，項目名稱最多 300 字。
- `services/caseWork.ts`：專用 GET/PUT；遠端失敗不回退本機。未設定端點時採獨立 IndexedDB readwrite transaction，版本比對與寫入原子化。本機只提供 local-demo 負責人，沒有正式帳號／角色安全邊界，不得放真實個資。
- `worker/work.js`：`GET /api/ae-reports/work-users`、`GET/PUT /api/ae-reports/:id/work`。所有讀寫（含名單）均先檢查已解析的 PV 角色；actor 沿用既有 Access 驗證身分。名單只回 PV email，不回 rep 或個人檔案；包含既存 PV users 及 bootstrap PV 選項。
- 工作資訊不放入 AEReport/payload、一般 case audit 或附件。一般 POST/PATCH 拒絕新工作欄位，回傳亦移除保留欄位，rep 不會透過一般個案取得新工作註記。
- PUT 以串流限制 200000 bytes，拒絕未知 schema 欄位（包括 client actor/time），負責人必須為目前有效選項。內部工作為整個小聚合的版本化 PUT，不以整份 case PATCH 保存。
- 單一 SQL conditional UPSERT 同時檢查個案未刪除及 work version。零筆變更回 409。資料庫 trigger 在同一交易產生獨立 `ae_work_audit` snapshot；actor/time 由 Worker 產生，稽核禁止 UPDATE/DELETE。失敗更新不產生稽核。GET 顯示最近 100 筆稽核 metadata，完整 snapshot 留在資料庫。
- 工作回應 `Cache-Control: no-store`。未新增病患資料測試，所有測試為合成資料。

## 遷移與部署順序

**先 schema，後 Worker/UI。此次未執行任何遠端 migration、部署、push 或合併。**

1. 在授權的部署流程中備份並確認既有 `worker/schema.sql` 已套用。
2. 套用 `worker/migrations/001_case_work.sql`，建立 `ae_case_work`、`ae_work_audit` 及不可變／自動稽核 triggers。migration 可重複套用，測試涵蓋重跑。
3. 部署 Worker 與 UI；Worker 會引用 `../services/caseWorkModel.js`，打包需保留此 import。
4. 以合成案確認 PV 讀寫、rep 403、版本衝突、稽核與未套 schema 的清楚錯誤。不要在正式案上試驗。

回滾應先回滾程式，保留資料表與稽核，不應刪表。既有個案首次 GET 回 version 0 空工作，首次 PUT 建立 version 1，不需回填。

## 本機驗證（2026-09-28）

- `node node_modules/typescript/bin/tsc --noEmit`：成功，無型別診斷。
- `git diff --check`：成功。
- 使用既有 `/var/minis/workspace/pv-test-evidence/adapter.mjs`：新增 UI 測試前曾完整結束 **198/198 通過**（既有 180 + 新模型／後端 13 + SQLite 整合 5）。這是相容適配器結果，**不是 Vitest**。
- 新增 UI／service 後的執行輸出逐項證實三個新檔 **22/22 通過**：`caseWork.test.ts` 13、`caseWork.integration.test.ts` 5、`caseWork.ui.test.ts` 4。該輪完整 suite 未產生 TOTAL，後續重跑 native bridge 只回 warning 而未執行完；**不宣稱完整 202/202 通過**。證據位於本機 `/var/minis/workspace/case-work-tests.txt`，沒有將未執行項算 pass。
- SQLite 整合測試實際執行 schema、migration、conditional UPSERT 和 triggers：驗證持久化、rep 隔離、stale first/subsequent writes、衝突不新增 audit、audit 不可改刪、audit 失敗回滾工作、刪除／不存在／無身分拒絕、一般 case PATCH 不覆蓋工作。
- UI 測試為 React server rendering（標題、篩選、內部 deadline 警示、ARIA）及 service fetch 契約、409／斷線不回退、驗證前不送出；不是瀏覽器完整點擊 E2E。
- UI 稽核去重的小修後執行型別與 diff 檢查，未取得再跑完整 adapter 的結束結果。
- 未執行 Vitest/Vite build：已知 native Node bridge 的 esbuild 限制，本輪未反覆排障。未驗證真實 D1／Cloudflare 併發、正式 Access policy 或瀏覽器 IndexedDB 互動；需在一般 Node/CI 與預備環境補驗。

## 第一版限制與上線阻擋

- 工作清單依目前已載入個案逐案 GET（依既有列表上限），沒有新的伺服器工作搜尋／分頁端點；大量個案載入較慢。篩選為這份快照，重新載入所選案可更新其狀態，尚無即時多人同步。
- 沒有通知、提醒排程、補件附件關聯、自動狀態轉移或自動結案；既有 regulatory follow-up 流程保持人工、獨立。
- 聯絡紀錄可更正但不可在 UI 刪除；資料庫保留每個版本 snapshot。本機僅保留最近 100 筆稽核 metadata，沒有正式不可變保證。
- 已閱讀 `/var/minis/workspace/pv-security-scan/code-review.md`。**既有 S1 同源主動附件、S2 rep 法規欄位 mass assignment、S3 一般 case 更新 TOCTOU/lost update 仍阻擋正式上線**。本次只保護新增工作資料，不宣稱修復整體既有風險；既有 audit client time/action、R2 孤兒、共用本機 outbox 等風險也仍存在。尤其 S1 同源腳本可借 PV session 影響任何新端點，不能以本功能角色檢查宣稱足以安全上線。

## 異動檔案

新增 `components/CaseWorkBoard.tsx`、`i18n/work.ts`、`services/caseWork.ts`、`services/caseWorkModel.js`、`worker/work.js`、`worker/migrations/001_case_work.sql`、`tests/caseWork.test.ts`、`tests/caseWork.integration.test.ts`、`tests/caseWork.ui.test.ts` 及本報告。修改 `components/AEIntakeConsole.tsx`、`i18n/translations.ts`、`worker/ae.js`。
