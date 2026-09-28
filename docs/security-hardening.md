# 安全修補交付紀錄

## 本輪範圍
只處理高風險 S1/S2/S3，不實作工作狀態、通知或提醒功能。未部署、未遠端 migration、未讀寫正式資料；測試使用 SQLite in-memory 合成個案。

## 防護
- S1：附件僅接受 PNG/JPEG/PDF，MIME 必須與簽名 bytes 相符；其他主動內容（HTML/SVG）拒絕。附件讀取一律 application/octet-stream、attachment、nosniff、sandbox CSP、no-store；下載檔名剔除換行及危險字元。無 dataURL 的指標只接受格式規範且已登記屬於該案的同源 API 路徑。前端亦不載入任意遠端 URL。
- S2：rep 新案 status 伺服器固定 submitted；保留一般臨床/通報資料，移除 triage 中 PV 專屬判定、因果性、預期性、嚴重性覆寫、assignee、監管送件與補件等欄位。PV PATCH 仍照舊處理；未改法規計算。
- S3：新案永遠 INSERT，不再用可能覆蓋碰撞 ID 的 upsert；rep 重送須為同 owner、draft/submitted 且版本吻合。PV PATCH 與 rep 更新均以 owner/status/deleted/version 條件式 UPDATE，affected rows 非 1 回 409。附件 metadata 和 audit 放在同一 SQLite/D1 batch 且依成功更新結果 gate；SQL rollback 不留 metadata/audit。增加 ae_cases.version 預設0與遷移 002，讀取/新增/更新 API 回版本；UI保存成功後採用遞增版本，避免 stale client lost update。

## 測試與遷移
`tests/worker.integration.test.ts` 新增 in-memory SQLite 回歸案例：HTML/MIME偽造、假URL、rep PV欄位淨化與status、拒絕PV已開始後重送、PV stale version 409、ID collision、條件更新失敗無audit/附件metadata、附件response安全標頭；既有合法PDF fixture更新。要驗證的完整 CI 仍須 GitHub Actions。部署流程需在程式前依序套用 schema（新環境）或 migration `worker/migrations/002_case_version.sql`（既有資料庫），本輪不執行遠端 migration。舊端點客戶端更新既有案必須攜帶 GET 回傳的 version，否則回409；須同時部署本輪 UI/Worker，舊客户端相容限制。

## 剩餘風險／未完成
- R2 物件先於 SQL 放置，若 DB conditional write 競態或SQL失敗會遺留孤兒物件；metadata不會留下錯誤，但尚未建補償刪除/回收流程。
- 附件嚴格拒絕 SVG、HEIC、GIF、WebP、TIFF、非base64/非標準格式及舊版 text/plain 檔案；需由使用者重新選取PNG/JPEG/PDF。PDF仍可含主動內容，但強制下載、nosniff及sandbox降低執行面，宜另用隔離來源/安全預覽。
- `002_case_version.sql` SQLite ALTER ADD COLUMN 非冪等；只可對未有version欄位的舊DB執行一次，勿盲目重跑。
- Local Workbench UI test had stale full-URL assertion despite existing service intentionally using relative `/case%20%2F%20one/work`; updated the test to match actual documented URL contract. Baseline CI had 201/202 passing (one stale assertion), final suite has 209/209 passing.

- Vitest升級到>=4.1.11本輪未完成：本地npm受快取/套件metadata錯誤阻礙；沒有用 `audit fix --force`。待 CI 檢驗既有Vitest版本。
- 由於本機node_modules的vitest/esbuild bridge沒有執行權限，本機無法跑Vitest；GitHub Actions正式CI已於Node 22與24全部成功（含型別、測試、build）。
- 未在正式環境驗證Cloudflare D1 batch/SQLite `changes()`語意與R2併發。