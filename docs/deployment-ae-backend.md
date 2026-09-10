# AE 收案後端部署 Runbook

不良反應（AE）個案收案後端的部署與驗收步驟。
架構理由與資料表設計見
[`superpowers/specs/2026-09-08-ae-case-reporting-design.md`](superpowers/specs/2026-09-08-ae-case-reporting-design.md) §7A。

> 這份文件假設你已經有 Cloudflare 帳號、`uic-ai.com` 網域在該帳號下，
> 且前端已部署於 `pvlink.uic-ai.com`。

---

## 0. 為什麼需要後端

沒有後端時，業務手機送出的個案寫在**那支手機的瀏覽器**裡，辦公室的後台永遠看不到。
本機模式只適合單機展示。要讓「業務在外面通報、藥安人員在辦公室收案」成立，
以下步驟是必要的，不是選配。

---

## 1. 建立資源（一次性）

```bash
cd worker
npx wrangler d1 create pv-link-ae
npx wrangler r2 bucket create pv-link-ae-attachments
```

把 `d1 create` 回傳的 `database_id` 填進 `worker/wrangler.toml` 的 `[[d1_databases]]`。

> 本專案已建置完成，ID 已寫在 `wrangler.toml` 裡；此節保留供重建或另建環境時參照。

## 2. 套用資料表

```bash
npx wrangler d1 execute pv-link-ae --remote --file=worker/schema.sql
```

schema 是冪等的（全部 `CREATE TABLE IF NOT EXISTS`），重跑安全。

驗證（應看到 3 張表、2 個 trigger）：

```bash
npx wrangler d1 execute pv-link-ae --remote \
  --command "SELECT type, name FROM sqlite_master WHERE type IN ('table','trigger') ORDER BY type, name"
```

**驗證稽核軌跡真的改不動**（這一步請實際跑一次，不要只相信 schema）：

```bash
npx wrangler d1 execute pv-link-ae --remote \
  --command "UPDATE ae_audit SET actor='hacker' WHERE 1"
# 預期：SQLITE_CONSTRAINT_TRIGGER: audit trail is append-only
```

跑出這個錯誤才算通過。若它成功執行，代表 trigger 沒建起來，**先別上線**。

## 3. 部署 Worker

```bash
cd worker
npx wrangler deploy
```

Worker 同時承載兩件事，共用同一套 Access 驗證與速率限制：

- `POST /api` → LLM proxy
- `/api/ae-reports*` → AE 收案 API

## 4. 前端設定

`.env.production` 已設好（同源部署，走相對路徑）：

```
VITE_AE_API_ENDPOINT=/api/ae-reports
```

改完要重新 build 才會生效：`npm run build`。
沒設這一行的 build 會**靜默退回本機模式**——UI 不會報錯，但個案不會離開手機。

---

## 5. Cloudflare Access（公司信箱 Email OTP）

業務端不自建帳號密碼。多一套密碼＝多一組會外洩、會被共用、要負責重設的憑證。
改用 Access 的 **One-time PIN**：使用者輸入**公司信箱** → 收一次性代碼 → 登入完成。

### 沒有密碼這回事

本系統**不自建帳號密碼**，也沒有「首次登入後修改密碼」這個步驟。
每次登入都是「輸入公司信箱 → 收一次性代碼 → 進入」。

這不是省略，是刻意的：多一套密碼就是多一組會外洩、會被業務之間互相借用、
要有人負責重設的憑證，而它換來的安全性比 OTP 低。

（業務首次登入後確實有一個一次性的設定步驟，但那是**填基本資料**而非改密碼，
見 §5B。）

### 為什麼是公司信箱

因為**離職即失效是自動的**。公司信箱在離職當天由 IT 停用，停用後就收不到 OTP，
Access policy 即使忘了清也進不來——安全性不依賴任何人記得去做某件事。

（相對地，私人 Gmail 沒有這個性質：離職業務的信箱誰也停不掉，
一把鑰匙會永遠留在他手上。這是本專案不採用私人信箱的唯一原因，也是充分的原因。）

### 設定步驟

1. Zero Trust → **Settings → Authentication → Login methods** → 確認 **One-time PIN** 已啟用。
2. Zero Trust → **Access → Applications** → 選 `PV-Link Auditor`（或新建 Self-hosted application）。
3. Application domain 設為 `pvlink.uic-ai.com`（含 `/api` 路徑，Worker 掛在同一網域下）。
4. Policy：Action = **Allow**，Include = **Emails**，**逐一列出**需要使用本系統的公司信箱。
5. Session duration 建議 **24 小時**：業務一天跑客戶不必重登，隔天要重新驗證。

### ⚠️ 逐一列舉，不要用網域規則

Access 的 **Emails ending in `@公司網域`** 看起來省事，但它的意思是
**全公司每一個人都能讀取病人不良反應個案**——包含財會、人資、工讀生。

個案內容是《個人資料保護法》第 6 條的特種個資（病歷、醫療、健康檢查）：
姓名縮寫、年齡、性別、事件描述，附件還可能有藥盒照與檢驗單。
存取範圍應該是「業務 + 藥安人員」，不是「有公司信箱的人」。

實際要列的人數大概是十幾到數十人，逐一列舉的維護成本，遠低於「全公司可讀病歷」的風險。
人數多到難以維護時，正確做法是建 Access Group（Zero Trust → Access → Groups）
再讓 policy 引用該 group，而不是退回網域規則。

> ⚠️ 若公司會**回收離職者的信箱**再指派給新人，該新人會直接繼承 Access 權限。
> 有這個慣例的話，離職流程仍需移除 policy 中的該筆 email。

### ⚠️ `pv-link-auditor.pages.dev` 尚未受保護

該網址目前可直接開啟，繞過 Access。在輸入任何真實病人資料之前必須先處理：
把該 `*.pages.dev` 網域也納入 Access application，或在 Pages 專案設定關閉該子網域。
**這是上線前的阻斷條件。**

### 身分與稽核軌跡的關係

稽核軌跡的 `actor` **只**取自已驗證的 Access JWT（`identity.email`），
前端送什麼身分一律不採信。沒有可信身分時 API 回 **401** 而不是「以匿名記錄」——
可被偽造的稽核軌跡比沒有稽核軌跡更糟，因為它會製造「有在管控」的錯覺。

---

## 5A. 角色設定（誰是業務、誰是藥安）

Access 只回答「這個 email 是不是自己人」。「這個人該看到什麼」由 D1 的 `ae_users` 決定：

| 角色 | 能做的事 |
|---|---|
| `rep`（業務） | 送出個案；**只讀得到自己送的個案** |
| `pv`（藥安人員） | 讀寫全部個案：判定、編碼、追蹤報告、軟刪除 |

**查無此人一律視為 `rep`。** 藥安人員必須被明確列出——設定漏了的後果是
「某人看不到全部個案」（他會來反映），而不是「某人看得到全部個案」（沒人會來反映）。

### 第一位藥安人員（開機）

`ae_users` 一開始是空的，沒有人有權限去新增第一個有權限的人。用 secret 打破死結：

```bash
cd worker
npx wrangler secret put AE_PV_EMAILS
# 貼上逗號分隔的藥安人員信箱，例：alice@company.com,bob@company.com
npx wrangler deploy
```

用 secret 而非 `wrangler.toml` 的 `[vars]`，因為那是真實人員信箱，不該進 git。

### 之後的人員異動

```bash
# 新增一位藥安人員
npx wrangler d1 execute pv-link-ae --remote --command \
  "INSERT INTO ae_users (email, role, display_name, created_at) \
   VALUES ('carol@company.com', 'pv', '王藥安', datetime('now'))"

# 把某人降回業務
npx wrangler d1 execute pv-link-ae --remote --command \
  "UPDATE ae_users SET role='rep', updated_at=datetime('now') WHERE email='carol@company.com'"

# 看目前有誰是藥安人員（含 secret 裡的 bootstrap 名單，那份要另外看）
npx wrangler d1 execute pv-link-ae --remote --command \
  "SELECT email, role, display_name FROM ae_users ORDER BY role, email"
```

業務端不必登錄——沒有列在 `ae_users` 裡的人本來就是 `rep`。
只要他在 Access 允許名單上，就能通報並看到自己的通報紀錄。

> 離職時**兩邊都要清**：Access policy 移除該 email（若公司會回收信箱）、
> 並把 `ae_users` 的該筆刪除或降為 `rep`。前者擋掉登入，後者是萬一信箱被回收時的第二道。

---

## 5B. 通報者基本資料（業務首次登入會看到的畫面）

業務第一次登入，會先被要求填一次基本資料，填完才進得到通報表單：

| 欄位 | 對應 CIOMS | 必填 |
|---|---|---|
| 姓名 | 26 通報者 | ✅ |
| 員工編號 | — | |
| 負責轄區 | — | |
| 聯絡電話 | — | ✅ |
| 聯絡信箱 | — | （留空則以登入信箱聯絡） |
| 公司／單位 | 24a 藥商名稱 | （由 `AE_ORG_NAME` 預設） |

這六個欄位每份通報都要，而且每次都一樣。存一次之後通報表單自動帶入，
第一屏從六個輸入框收成一張摘要卡——手機上這是差別最大的一處。

**為什麼強制、不給跳過**：通報驗證要求「可辨識的通報者」與至少一個聯絡方式。
不填，第一次通報就會卡在驗證錯誤；而那時業務人在客戶端、手上有個真實個案，
是最不該讓他停下來填基本資料的時刻。

要改資料：通報表單第一步的「編輯」按鈕。改完之後**所有未來的通報**都用新資料，
已送出的個案不受影響（它記錄的是當下那一份）。

公司名稱的預設值設在 `worker/wrangler.toml` 的 `AE_ORG_NAME`，
請確認它與貴公司在 CIOMS 表格上要呈現的名稱一致：

```toml
AE_ORG_NAME = "天義企業股份有限公司"
```

> ⚠️ 檔案裡的姓名是**顯示用**資料。「這份通報是誰送的」由 Access JWT 決定並自動記錄，
> 使用者把姓名改成同事的名字也動不了那筆稽核紀錄。建檔解決的是「不用重打」，
> 不是「確認身分」——後者早就由登入帳號解決，而且解得比任何表單欄位牢靠。

---

## 6. 實機測試（業務手機）

1. **確認用的是正式版**：手機開 `https://pvlink.uic-ai.com/#/report`。
   Access 會先要求 email；輸入後收信取得代碼。
   首次登入會出現「通報者基本資料」畫面（§5B），填完姓名與電話才進得到表單——
   這一步只會出現一次。
2. **送一筆測試個案**（`患者姓名縮寫 T.E.S.T.`，事件寫「測試個案，請勿處理」）。
   四要素齊備才送得出去：可辨識病人、可辨識通報者、可疑藥品、不良事件。
3. **換裝置驗收**：在辦公室電腦開 `https://pvlink.uic-ai.com/#/`，切到「個案收案」頁籤。
   **看得到那筆個案 = 後端確實通了**；看不到就是還在本機模式（回頭檢查步驟 4）。
   （這一步必須用**藥安人員**的帳號；業務帳號開 `#/` 只會看到通報表單。）
3b. **驗角色分權**（這一步不能跳過，它是「業務看不到別人個案」的唯一證明）：
   - 用業務帳號的手機開 `#/`，應該**仍是通報表單**，進不去後台。
   - 用業務帳號點右上角的清單圖示 →「我的通報紀錄」，應**只看到自己送的那一筆**。
   - 請第二位業務也送一筆，確認第一位業務在「我的通報紀錄」裡**看不到**第二筆。
   - 進階（可選）：用業務帳號直接打 `https://pvlink.uic-ai.com/api/ae-reports`，
     回傳的 `cases` 應只含自己送的個案——這才是真正驗到後端，前端畫面不算數。
4. **驗離線補送**：手機開飛航模式，再送一筆 → 應顯示「已排入待送佇列」；
   關掉飛航模式重開頁面 → 佇列自動補送。
5. **驗附件**：上傳一張藥盒照，後台點得開 = R2 通了。
6. **收尾**：測試個案在後台軟刪除（會要求填理由）。
   資料列與稽核軌跡仍留在資料庫，這是刻意的。

### 常見狀況

| 症狀 | 原因 | 處理 |
|---|---|---|
| API 回 **501** `AE backend not configured` | Worker 沒綁 D1 | 檢查 `wrangler.toml` 的 `[[d1_databases]]`，重新 `wrangler deploy` |
| API 回 **401** `no verified identity` | 沒過 Access，或 `ACCESS_AUD` 對不上 | 檢查 Access application 的 AUD tag 與 `wrangler.toml` 一致 |
| 後台看不到手機送出的個案 | 前端仍是本機模式 | `.env.production` 是否有 `VITE_AE_API_ENDPOINT`；build 後是否真的重新部署 |
| 附件點不開 | R2 未綁定 | 檢查 `[[r2_buckets]]`，重新 deploy |
| 業務登入後看到「拒絕存取」 | email 不在允許名單 | Access policy 的 Emails 清單加入該 email |
| 藥安人員登入後只看到通報表單 | 該 email 未被設為 `pv` | 加進 `AE_PV_EMAILS` secret 或 `ae_users`（見 §5A） |
| API 回 **403** `requires PV role` | 以業務身分呼叫藥安專用的操作 | 這是預期行為；確認該帳號是否應為 `pv` |

---

## 7. 上線前檢查表

- [ ] `ae_audit` 的 append-only trigger 已實測（步驟 2）
- [ ] `pv-link-auditor.pages.dev` 已鎖上或關閉
- [ ] Access policy 用**公司信箱、個別列舉**，沒有 `Emails ending in` 網域規則
- [ ] `AE_PV_EMAILS` 或 `ae_users` 已設好藥安人員，且**只有**該設的人是 `pv`
- [ ] `AE_ORG_NAME` 與貴公司要印在 CIOMS 24a 的名稱一致
- [ ] 已用業務帳號實測：進不去後台、「我的通報紀錄」只有自己的個案（§6 步驟 3b）
- [ ] 若公司會回收信箱：離職流程已加入「移除 Access policy 的 email」
- [ ] 換裝置驗收通過（手機送、電腦收）
- [ ] 測試個案已清除
