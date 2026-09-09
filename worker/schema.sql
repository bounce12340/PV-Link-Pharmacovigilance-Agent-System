-- PV-Link 不良反應個案（AE）收案資料庫 — Cloudflare D1 (SQLite)
--
-- 套用方式：
--   npx wrangler d1 execute pv-link-ae --remote --file=worker/schema.sql
--
-- ── 為什麼個案本體存 JSON 而非完全正規化 ───────────────────────────────────
-- AEReport 是一個會持續長出欄位的巢狀結構（events[]、drugs[]、triage、auditTrail…），
-- 而且前端已經有一整套經過單元測試的領域模型。若拆成十幾張表，就要維護兩份結構定義
-- 與雙向對映，欄位一改就漂移——這是這類系統最常見的長期債。
--
-- 因此：個案本體以 JSON 存於 payload（單一真實來源），只把**實際會查詢／排序／索引**
-- 的欄位展開成資料行。個案量級為一年數百至數千筆，這個取捨在效能上毫無壓力。
--
-- 例外是稽核軌跡：它必須獨立成表且只增不改（見 ae_audit 的說明）。

PRAGMA foreign_keys = ON;

-- ── 個案 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ae_cases (
  id                TEXT PRIMARY KEY,
  case_number       TEXT NOT NULL,
  -- 個案本體（AEReport 的 JSON）。前端寫什麼、讀回什麼，不做欄位對映。
  payload           TEXT NOT NULL,

  -- 以下皆由伺服器從 payload 展開，供查詢與排序使用；不接受前端直接指定。
  status            TEXT NOT NULL,
  report_type       TEXT NOT NULL DEFAULT 'initial',
  follow_up_of_id   TEXT,
  awareness_date    TEXT,              -- Day 0；法定時鐘的起點
  due_date          TEXT,              -- 嚴重個案的法定到期日；非嚴重為 NULL
  serious           INTEGER NOT NULL DEFAULT 0,
  country           TEXT,
  suspect_drug      TEXT,              -- 首個懷疑藥品，供收件匣列表顯示
  patient_key       TEXT,              -- 病人縮寫／代號，供重複偵測初篩

  -- 誰送的：一律取自已驗證的 Access JWT，前端無法指定
  submitted_by      TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,

  -- 軟刪除：個案不做實體刪除，否則稽核軌跡會跟著消失
  deleted_at        TEXT,
  deleted_by        TEXT,
  deleted_reason    TEXT
);

-- 收件匣的預設排序是「法定時限壓力」，因此索引建在到期日與嚴重性上。
CREATE INDEX IF NOT EXISTS idx_ae_cases_due      ON ae_cases (deleted_at, serious, due_date);
CREATE INDEX IF NOT EXISTS idx_ae_cases_status   ON ae_cases (deleted_at, status);
CREATE INDEX IF NOT EXISTS idx_ae_cases_chain    ON ae_cases (follow_up_of_id);
CREATE INDEX IF NOT EXISTS idx_ae_cases_number   ON ae_cases (case_number);
-- 重複偵測的初篩：先用病人鍵縮小範圍，再交給前端的加權比對
CREATE INDEX IF NOT EXISTS idx_ae_cases_patient  ON ae_cases (deleted_at, patient_key);

-- ── 稽核軌跡（只增不改）──────────────────────────────────────────────────
--
-- 這張表刻意獨立於 ae_cases.payload 之外，原因有三：
--   1. 個案 payload 每次更新都是整份覆寫；軌跡若混在裡面，一次寫壞就全沒了。
--   2. actor 必須是伺服器從已驗證 JWT 取得的身分。放在 payload 裡等於讓前端自報身分，
--      稽核上完全不成立——這正是先前版本 actor 寫死預設值的那個缺口。
--   3. GxP 要求軌跡不可竄改。應用層一律只 INSERT，永不 UPDATE / DELETE；
--      下方 trigger 把這件事釘死在資料庫層，不依賴應用程式自律。
CREATE TABLE IF NOT EXISTS ae_audit (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id    TEXT NOT NULL,
  at         TEXT NOT NULL,
  actor      TEXT NOT NULL,   -- 來自 Access JWT 的 email
  action     TEXT NOT NULL,
  detail     TEXT,
  FOREIGN KEY (case_id) REFERENCES ae_cases(id)
);

CREATE INDEX IF NOT EXISTS idx_ae_audit_case ON ae_audit (case_id, seq);

-- 資料庫層的不可竄改保證：任何 UPDATE / DELETE 直接中止交易。
-- 即使日後有人寫錯應用程式碼，或有人拿到 DB 憑證想改紀錄，都會被擋下。
CREATE TRIGGER IF NOT EXISTS trg_ae_audit_no_update
BEFORE UPDATE ON ae_audit
BEGIN
  SELECT RAISE(ABORT, 'audit trail is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_ae_audit_no_delete
BEFORE DELETE ON ae_audit
BEGIN
  SELECT RAISE(ABORT, 'audit trail is append-only');
END;

-- ── 附件（metadata 在此，檔案本體在 R2）──────────────────────────────────
--
-- 照片不進資料庫：一張壓縮後的藥盒照約 300KB–1.5MB，塞進 D1 會讓每次讀取個案
-- 都拖著它跑，且 D1 有列大小限制。R2 存 blob、D1 只留指標，是這類資料的正解。
CREATE TABLE IF NOT EXISTS ae_attachments (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL,
  r2_key      TEXT NOT NULL,
  name        TEXT,
  mime        TEXT,
  size        INTEGER,
  added_at    TEXT NOT NULL,
  added_by    TEXT NOT NULL,   -- 同樣取自 JWT
  deleted_at  TEXT,
  FOREIGN KEY (case_id) REFERENCES ae_cases(id)
);

CREATE INDEX IF NOT EXISTS idx_ae_attachments_case ON ae_attachments (case_id, deleted_at);
