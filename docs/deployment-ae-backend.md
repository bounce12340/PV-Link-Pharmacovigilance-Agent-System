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

## 5. Cloudflare Access（Email OTP）

業務端不自建帳號密碼。多一套密碼＝多一組會外洩、會被共用、要負責重設的憑證。
改用 Access 的 **One-time PIN**：使用者輸入 email → 收一次性代碼 → 登入完成。

### 設定步驟

1. Zero Trust → **Settings → Authentication → Login methods** → 確認 **One-time PIN** 已啟用。
2. Zero Trust → **Access → Applications** → 選 `PV-Link Auditor`（或新建 Self-hosted application）。
3. Application domain 設為 `pvlink.uic-ai.com`（含 `/api` 路徑，Worker 掛在同一網域下）。
4. Policy：Action = **Allow**，Include = **Emails**，逐一列出允許的 email。
5. Session duration 建議 **24 小時**：業務一天跑客戶不必重登，隔天要重新驗證。

### ⚠️ 三個不可犯的錯

1. **絕不可用 `@gmail.com` 網域規則**（Include → Emails ending in）。
   那等於全世界擁有 Gmail 帳號的人都能進來讀取病人資料。
   個人 Gmail 只能用 **Emails**（個別列舉）。

2. **私人 Gmail 沒有離職自動失效**。公司信箱可隨離職一併停用，私人信箱不會——
   離職業務會永遠留著一把鑰匙。**必須把「從 Access policy 移除 email」寫進離職檢查表。**
   可行的話優先用公司信箱，私人 Gmail 僅作為公司信箱無法收信時的例外。

3. **`pv-link-auditor.pages.dev` 目前未受 Access 保護**，可直接開啟。
   在輸入任何真實病人資料之前必須先處理：把該 `*.pages.dev` 網域也納入 Access application，
   或在 Pages 專案設定關閉該子網域。⚠️ **這是上線前的阻斷條件。**

### 身分與稽核軌跡的關係

稽核軌跡的 `actor` **只**取自已驗證的 Access JWT（`identity.email`），
前端送什麼身分一律不採信。沒有可信身分時 API 回 **401** 而不是「以匿名記錄」——
可被偽造的稽核軌跡比沒有稽核軌跡更糟，因為它會製造「有在管控」的錯覺。

---

## 6. 實機測試（業務手機）

1. **確認用的是正式版**：手機開 `https://pvlink.uic-ai.com/#/report`。
   Access 會先要求 email；輸入後收信取得代碼。
2. **送一筆測試個案**（`患者姓名縮寫 T.E.S.T.`，事件寫「測試個案，請勿處理」）。
   四要素齊備才送得出去：可辨識病人、可辨識通報者、可疑藥品、不良事件。
3. **換裝置驗收**：在辦公室電腦開 `https://pvlink.uic-ai.com/#/`，切到「個案收案」頁籤。
   **看得到那筆個案 = 後端確實通了**；看不到就是還在本機模式（回頭檢查步驟 4）。
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

---

## 7. 上線前檢查表

- [ ] `ae_audit` 的 append-only trigger 已實測（步驟 2）
- [ ] `pv-link-auditor.pages.dev` 已鎖上或關閉
- [ ] Access policy 用**個別 email**，沒有 `@gmail.com` 網域規則
- [ ] 離職檢查表已加入「移除 Access policy 的 email」
- [ ] 換裝置驗收通過（手機送、電腦收）
- [ ] 測試個案已清除
