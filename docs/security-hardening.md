# 安全修補交付紀錄

## 本輪範圍
只處理高風險 S1/S2/S3，不實作工作狀態、通知或提醒功能。未部署、未遠端 migration、未讀寫正式資料；測試使用 SQLite in-memory 合成個案。

## 防護
- S1：附件僅接受 PNG/JPEG/PDF，MIME 必須與簽名 bytes 相符；其他主動內容（HTML/SVG）拒絕。附件讀取一律 application/octet-stream、attachment、nosniff、sandbox CSP、no-store；下載檔名剔除換行及危險字元。無 dataURL 的指標只接受格式規範且已登記屬於該案的同源 API 路徑。前端亦不載入任意遠端 URL。
- S2：rep `POST` 採根欄位、`events[]`、`drugs[]` 的明確 allowlist 正規化；未知鍵、`events[].meddraPt`／`meddraSoc`／`meddraVerified` 與整個 `triage`（包括 `triage.notes`）均不接受。一般臨床／通報欄位保留；PV PATCH 仍可寫完整 AEReport，未改法規計算。既存案合法 rep 重送會保留已存在的 PV triage 與同事件 id 的 MedDRA 欄位，避免舊 rep payload 清除後台內容。
- S3：新案永遠 INSERT，不再用可能覆蓋碰撞 ID 的 upsert。既存 rep POST 必須帶 GET/前次成功 POST 回傳的安全整數 `version`，缺少、格式錯誤或過期皆回 409；伺服器不會讀取 DB 最新 version 偽造匹配。合法新案可省略版本；合法同版本 outbox 重送回 200 和新版本；409 留在 outbox 供 UI reload/reconcile，不能盲目當暫時網路錯誤重送。PV PATCH 同樣以條件式 version UPDATE 處理。
- S3 原子性：每次 case write／DELETE 生成非時間衍生的 UUID `last_mutation_id`，條件 UPDATE/INSERT、附件 metadata 與 audit 均在同一 SQLite/D1 batch，後兩者只匹配**本次** UUID；因此失敗的條件寫入即使與另一成功寫入同毫秒、同 version，也不能留下 metadata/audit。SQL batch 回滾不留 case、metadata 或 audit。這取代不安全的 timestamp+version／跨 statement `changes()` gate。

## 測試與遷移
- `tests/worker.integration.test.ts` 與 repo 外可重現的 SQLite adapter 覆蓋：rep stale／缺 version 409、rep MedDRA/triage/未知欄位拒絕、合法臨床欄位保留、PV 內容在合法 rep retry 不被清除、固定同毫秒 stale audit、條件寫入失敗不留 attachment metadata/audit、以及 fresh／upgrade／rerun migration matrix。完整 CI 仍須在一般 Node/CI 執行。

### 002 case version migration policy

`worker/schema.sql` 是**最新 fresh install** schema，已含 `version` 和 `last_mutation_id`；fresh DB 只需 schema，**不得**再直接執行 002 或 004。既有資料庫必須透過受控 runner 依序執行：runner 建立 `schema_migrations` ledger、以 `PRAGMA table_info(ae_cases)` 確認舊表存在且尚無欄位後才執行 002（version）及 004（last_mutation_id），並同交易記錄各自 ledger；已含欄位的 DB（包括 fresh schema 或已升級 DB）只記錄／跳過對應 SQL。SQLite 沒有可攜的 `ADD COLUMN IF NOT EXISTS`，所以 migration SQL 本身刻意不可盲目重跑。

本 repo 的 `worker/migrations/run-local.mjs` 僅供本機合成 SQLite 預檢／matrix；不會連線、不會呼叫 Wrangler、不能當作 remote D1 migration 工具。部署程序應在獲准的環境先備份、查 ledger/schema，再以已審核的受控流程執行；本輪不執行遠端 migration。

API 回應的成功 version 為資料庫實際值；舊客戶端更新既有案必須攜帶 GET/前次成功回傳的 version，否則回409；須同時部署本輪 UI/Worker，舊客户端相容限制。

## 剩餘風險／未完成
- R2 物件先於 SQL 放置，若 DB conditional write 競態或SQL失敗會遺留孤兒物件；metadata不會留下錯誤，但尚未建補償刪除/回收流程。
- 附件嚴格拒絕 SVG、HEIC、GIF、WebP、TIFF、非base64/非標準格式及舊版 text/plain 檔案；需由使用者重新選取PNG/JPEG/PDF。PDF仍可含主動內容，但強制下載、nosniff及sandbox降低執行面，宜另用隔離來源/安全預覽。
- `002_case_version.sql` 不可直接重跑是 SQLite 的固有限制；已提供 ledger/PRAGMA 預檢的本機 runner 與 fresh/upgrade/rerun matrix。任何遠端 D1 執行仍需要獲准的備份、預檢與平台驗證。
- 本機 adapter 是 Node `node:sqlite` 合成交易，不是 Cloudflare D1 runtime；D1 batch 的 statement 順序、UUID gate 與 rollback 必須在 staging 合成資料另行驗證。