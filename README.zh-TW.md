[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

---

# PV-Link：藥品安全監測代理系統

![React](https://img.shields.io/badge/React-19-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg) ![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%7C%20D1%20%7C%20R2-orange.svg) ![OpenAI-compatible](https://img.shields.io/badge/AI-OpenAI--compatible-green.svg) ![Tests](https://img.shields.io/badge/tests-148-brightgreen.svg)

**PV-Link** 涵蓋藥商 ICSR 收案的兩半：**文獻監測**（已發表文獻怎麼說你的產品）與**自發性通報**（你的業務從臨床端聽到什麼）。兩條管道匯入同一個個案庫、同一套稽核軌跡、同一個訊號聚合畫面。

---

## 系統全貌

```
 ┌─ 文獻管道 ────────────────────┐   ┌─ 自發性通報管道 ─────────────────┐
 │  PubMed E-utilities           │   │  業務手機通報   #/report          │
 │       ↓                       │   │       ↓（離線佇列）               │
 │  AI 評分與摘要                │   │  POST /api/ae-reports            │
 │       ↓                       │   │       ↓                          │
 │  結構化資料擷取               │   │  藥安收案處理台（七道關卡）       │
 └───────────┬───────────────────┘   └───────────┬──────────────────────┘
             └──────────────┬────────────────────┘
                            ↓
          正式庫 · 稽核軌跡 · 成分 × MedDRA PT 訊號聚合
                            ↓
            CIOMS-I 草稿 · E2B(R3) 映射 · CSV 匯出
```

全部跑在同一個網域（`pvlink.uic-ai.com`）、同一套 Cloudflare Access 驗證之下：一個純靜態的 React 前端，加上一支同時承載 LLM proxy 與收案 API 的 Worker。

---

## 文獻監測

*   🔍 **確定性檢索** —— 直接串接 **NCBI PubMed E-utilities** 官方 API，結果精確且可重現。支援多成分同時檢索（`Fenofibrate, Aspirin`）、自訂日期區間，以及可設上限的分頁抓取。
*   🤖 **AI 評分與摘要** —— 相關性評分（0–100）、摘要白話化，以及獨立抽出的**關鍵結論**。以平行批次執行，頂部有即時進度條。
*   📊 **結構化擷取** —— 成分、不良事件原文、MedDRA 候選詞、嚴重性、因果關係。
*   🧬 **MedDRA 對照層** —— 內建常見 PV 事件的 **PT → SOC 種子字典**，離線驗證 AI 猜測的 PT 並補上系統器官分類。⚠️ 完整 MedDRA 字典需授權，請自行擴充種子或接上有授權的來源。
*   💾 **正式庫管理** —— 多欄位模糊搜尋、日期篩選、CSV 匯出、IndexedDB 持久化（首次載入自動從 localStorage 遷移）。

## 不良反應個案通報

通報管道有兩個介面，各自對應一種使用者。

### 📱 業務通報端（手機優先，`#/report`）

*   欄位對應 **CIOMS Form I** 全部 26 個編號欄位（欄號直接標在旁邊），另加台灣實務需要的**批號、有效期限與許可證字號**。
*   拆成六步驟而非一頁四十個輸入框；16px 輸入框（避免 iOS 自動放大）、≥44px 觸控目標、chip 選擇器取代原生下拉選單。
*   **草稿自動儲存**（600ms debounce）、**離線佇列**恢復連線自動補送、**裝置端照片壓縮**（長邊 1600px）。
*   驗證分成錯誤與警告：只有四要素這類硬缺口會擋住送出，其餘轉為待補清單——**一份不完整的通報，勝過一份從未送出的通報**。
*   **通報者資料只填一次**。首次登入填姓名、員編、電話、公司（CIOMS 26／24a），之後每份通報自動帶入，第一屏從六個輸入框收成一張摘要卡。
*   **我的通報紀錄** —— 唯讀清單，看得到自己送過哪些案、目前狀態到哪。

### 🗂️ 藥安收案處理台

*   收件匣依**法定時限壓力**排序（逾期 → 剩餘天數 → 新進），不是先進先出。
*   七道關卡：收案登錄 → 效度判定（ICSR 四要素）→ **重複偵測** → 嚴重性判定（人工覆寫留痕）→ MedDRA 編碼／預期性／因果關係 → 追蹤報告 → 送件與結案。
*   **法定時鐘** —— 嚴重個案自首次獲知日起 15 日倒數；逾期轉紅，五日內轉琥珀。
*   **追蹤報告** —— 一鍵由原案建立（編號 `PARENT-F1`），Day 0 設為獲知新資訊當日。帶來重要新資訊才重啟 15 日時鐘，否則沒有新的快速通報期限，收錄於定期安全性報告。追蹤鏈不納入重複偵測。
*   **境外個案** —— 通報表單收發生國別（CIOMS 1a），後台標記並映射進 CIOMS 與 E2B `E.i.9`。
*   一鍵產生 **CIOMS-I 文字表格**與 **E2B(R3) 欄位映射**；個案清單可匯出 CSV；全流程有完整**稽核軌跡**（誰、何時、做了什麼）。
*   個案與文獻紀錄一起進入**成分 × MedDRA PT** 訊號聚合。

> 📖 欄位依據、法規要點與後台作業流程：[`docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md`](docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md)

---

## 存取控制與角色

登入採 **Cloudflare Access Email OTP**，以公司信箱驗證——沒有密碼可外洩、可共用、可要求重設。離職即失效是自動的：信箱一停用就收不到一次性代碼，即使沒人記得清理 policy 也進不來。

Access 回答的是「這個人是不是自己人」。至於**他該看到什麼**，由 D1 決定：

| 角色 | 能做的事 |
|---|---|
| `rep`（業務） | 送出個案；**只讀得到自己送的** |
| `pv`（藥安人員） | 讀寫全部個案 |

不在 `ae_users` 裡的一律是 `rep`。設定漏了的後果因此是「某人看不到全部個案」（他會來反映），而不是「某人看得到全部個案」（沒人會來反映）。第一位藥安人員用 `wrangler secret put AE_PV_EMAILS` 開機。

> ⚠️ Access policy 必須逐一列舉個別 email。設 `Emails ending in @公司網域` 等於**全公司每個人**（含財會、人資、工讀生）都能讀病人不良反應資料。名單變長請改用 Access Group，不是退回網域規則。

> ⚠️ 執行點在 Worker，不在畫面。hash 路由（`#/report`）無法用 Access 的路徑規則分權——`#` 後的片段不會送到伺服器——所以前端的角色判斷只是體驗。每一條 API 都自己查角色，個案清單的過濾寫在 SQL 而非 JS，讀不到的個案回 404 而非 403（403 等於確認那個 id 存在）。

---

## AI 模型

### 目前部署

| | 值 | 設定位置 |
|---|---|---|
| 端點 | `https://ollama.com/v1`（Ollama Cloud） | `worker/wrangler.toml` 的 `LLM_BASE_URL` |
| 模型 | `deepseek-v4-pro` | `worker/wrangler.toml` 的 `LLM_MODEL` |
| JSON 模式 | 關閉——上游對 `response_format` 支援不一，改以 `parseJsonLoose` 解析 | `LLM_JSON_MODE = "0"` |
| Temperature | `0.2` | `services/llmService.ts` |
| API 金鑰 | 伺服器端 secret，永不進前端 bundle | `wrangler secret put LLM_API_KEY` |

AI 層（`services/llmService.ts`）講的是標準 **OpenAI Chat Completions**，不依賴任何廠商 SDK，所以換供應商只是改兩個環境變數，不動程式碼：

| 供應商 | Base URL | 模型範例 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `moonshotai/kimi-k2` |
| Ollama（本機） | `http://localhost:11434/v1` | `llama3.1` |

### 模型做什麼、不做什麼

模型負責**閱讀**：相關性評分、摘要白話化、關鍵結論抽取，以及從自由文字擷取不良事件的結構化資料。

**凡是有法規後果的判斷，全都是有單元測試的純函式，完全不經過模型**：

*   嚴重性判定與 15 日法定時鐘
*   ICSR 四要素與其餘驗證規則
*   重複偵測
*   CIOMS-I 與 E2B(R3) 映射
*   角色與權限判斷

這個切法是刻意的。換模型、或模型今天狀況不好，影響的是摘要品質；**它動不了法定期限、放不過四要素不齊的個案、也不會讓某個業務看到另一個業務的病人**。

> ⚠️ 所有 AI 產出都是**供覆核的草稿**。CIOMS-I 尤其必須由合格藥安人員檢查補全後才能送件。

---

## 資料存放位置

| 資料 | 存放 | 說明 |
|---|---|---|
| AE 個案 | **D1**（`ae_cases`） | 個案本體為 JSON payload，另抽出供查詢與排序的索引欄 |
| 稽核軌跡 | **D1**（`ae_audit`） | 獨立資料表，**只增不改由資料庫 trigger 強制**，不靠應用層自律 |
| 附件 | **R2** | 一張壓縮後的藥盒照 0.3–1.5MB，留在 payload 裡會讓每次列表查詢都把它拖出來 |
| 使用者與角色 | **D1**（`ae_users`） | email → 角色，以及通報者個人檔案 |
| 速率限制 | **KV** | 固定時間窗，每 IP 每分鐘 |
| 文獻正式庫 | **IndexedDB** | 瀏覽器端；文獻管道目前尚無伺服器元件 |

> ⚠️ 未設定 `VITE_AE_API_ENDPOINT` 時，通報端與後台共用**同一個瀏覽器**的 IndexedDB，只適合單機試用。正式上線一定要有後端。

---

## 技術堆疊

*   **前端** —— React 19、TypeScript 5.8、Vite 6、Tailwind CSS 3.4、Heroicons；hash 路由（純靜態部署，不需伺服器 rewrite）
*   **後端** —— Cloudflare Workers（LLM proxy + 收案 API）、D1（SQLite）、R2、KV
*   **身分驗證** —— Cloudflare Access（Email OTP），JWT 由 Worker 對 team JWKS 驗證
*   **AI** —— 任何 OpenAI 相容的 Chat Completions API，不綁供應商、不用廠商 SDK
*   **資料來源** —— NCBI PubMed E-utilities
*   **測試** —— vitest 3 + jsdom；CI 在 Node 22.x 與 24.x 上跑型別檢查、測試與建置

---

## 快速開始

```bash
npm install
cp .env.example .env.local   # 依下方說明填入
npm run dev                  # http://localhost:3000
```

**本機開發**時前端可直連任一 OpenAI 相容端點：

```env
VITE_LLM_BASE_URL=https://api.openai.com/v1
VITE_LLM_API_KEY=sk-xxxx
VITE_LLM_MODEL=gpt-4o-mini
```

> ⚠️ `VITE_` 開頭的變數會被打包進前端——本機自用沒問題，**不適合公開部署**。公開部署請改用 Worker proxy，前端只設 `VITE_PV_PROXY_ENDPOINT`，金鑰留在伺服器端。

### 使用流程

1.  **檢索設定** —— 輸入目標成分（逗號分隔，例 `Aspirin, Ibuprofen`）與監測日期區間。
2.  **啟動任務** —— 系統向 PubMed 發出請求，並自動濾掉正式庫已有的文獻。
3.  **待核閱** —— 閱讀 AI 摘要與臨床結論，確認有 PV 價值者**匯入正式庫**。
4.  **正式庫** —— 搜尋歷史紀錄、匯出 CSV 報表。
5.  **分享通報連結** —— 在「個案收案」頁籤，手機圖示可開啟表單，連結圖示可複製 `#/report` 網址（做成 QR code 給業務很好用）。
6.  **收案處理** —— 個案依時限壓力排序進來，逐案走過效度 → 重複偵測 → 嚴重性 → 編碼 → 追蹤 → 送件。
7.  **產出送件文件** —— 產生 CIOMS-I 草稿，覆核後送主管機關，登錄回執字號並結案。

---

## 部署

### LLM proxy

```bash
cd worker
npx wrangler secret put LLM_API_KEY            # 上游金鑰，只留伺服器端
npx wrangler kv namespace create RATE_LIMIT    # 將回傳的 id 填入 wrangler.toml
npx wrangler deploy                            # LLM_BASE_URL / LLM_MODEL 於 wrangler.toml 設定
```

接著把 `VITE_PV_PROXY_ENDPOINT` 指向部署後的 Worker 並重新 build。此時前端**不含**任何 LLM 金鑰。速率限制的 KV 未綁定時 Worker 會自動略過、照常運作。

### 不良反應收案後端

收案 API 掛在**同一支** Worker、走**同一套** Access 驗證，不必再養第二套登入。

```bash
cd worker
npx wrangler d1 create pv-link-ae                       # 將 database_id 填入 wrangler.toml
npx wrangler r2 bucket create pv-link-ae-attachments
npx wrangler d1 execute pv-link-ae --remote --file=worker/schema.sql
npx wrangler secret put AE_PV_EMAILS                    # 開機用的藥安人員信箱，逗號分隔
npx wrangler deploy
```

接著設定 `VITE_AE_API_ENDPOINT=/api/ae-reports`（`.env.production` 已內建）並重新 build。

> 📖 完整 runbook、角色管理指令、實機測試流程與上線前檢查表：[`docs/deployment-ae-backend.md`](docs/deployment-ae-backend.md)

---

## 測試

```bash
npm test           # vitest，148 個單元測試
npm run typecheck  # tsc --noEmit
npm run build      # 產出正式建置
```

凡是有法規後果的純函式都有測試：效度、嚴重性、法定時鐘、重複偵測、CIOMS／E2B 映射、訊號聚合、`parseJsonLoose`、`reconcile`、MedDRA 對照，以及權限規則。動態 i18n 鍵（`ae.issue.*`、`ae.status.*`）的中英翻譯覆蓋率也由測試把關。

Worker 無法匯入前端的 TypeScript 模組，其嚴重性與到期日判定是刻意的鏡像。`tests/worker.ae.test.ts` 用同一批個案餵給兩邊逐案比對——鏡像一旦漂移，症狀就是法定期限算錯，很難在測試環境重現，卻直接影響通報義務。

權限規則每條都連同反面一起測，因為每一條失敗都對應「某個業務讀到了別人通報的病人資料」。

---

## 文件

| 文件 | 內容 |
|---|---|
| [`docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md`](docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md) | CIOMS／E2B 欄位依據、台灣法規要點、收案七道關卡、後端架構、角色分權、通報者個人檔案 |
| [`docs/deployment-ae-backend.md`](docs/deployment-ae-backend.md) | 部署 runbook、Access 設定、角色管理、實機測試流程、上線前檢查表 |

## 授權條款 (License)

MIT License
