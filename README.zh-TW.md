[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

---

# PV-Link: 藥品安全監測代理系統 (Pharmacovigilance Agent System)

![React](https://img.shields.io/badge/React-19-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg) ![OpenAI-compatible](https://img.shields.io/badge/AI-OpenAI--compatible-green.svg)

**PV-Link** 是一個專為藥品安全監視 (Pharmacovigilance, PV) 打造的專業自動化代理系統。本系統旨在解決傳統人工文獻審查耗時且容易遺漏的問題，透過串接官方文獻資料庫與大型語言模型 (LLM)，提供從檢索、評分、摘要到結構化數據抽取的一站式解決方案。

## ✨ 核心功能 (Core Features)

*   🔍 **精準文獻檢索 (Deterministic Search)**
    *   直接串接 **NCBI PubMed E-utilities 官方 API**，確保檢索結果的絕對精確性與可重現性。
    *   支援**複數目標成分**同時檢索（例如：`Fenofibrate, Aspirin`），自動轉換為精確的 PubMed 查詢語法。
    *   支援自訂監測日期區間。
*   🤖 **AI 智能評分與摘要 (AI Scoring & Summarization)**
    *   可串接任何 **OpenAI 相容的 Chat Completions 端點**（OpenAI、Azure OpenAI、Ollama、OpenRouter、Kimi…），對新進文獻進行 PV 關聯性評分 (0-100分)。
    *   自動將生硬的英文醫學摘要，轉化為易讀的**繁體中文摘要**。
    *   獨立提煉出對藥安監測最重要的**「臨床結論 (Key Conclusion)」**，並支援一鍵複製。
*   📊 **結構化數據抽取 (Structured Data Extraction)**
    *   自動從文獻中提取關鍵 PV 數據，包含：目標成分、不良反應描述 (AE Verbatim)、MedDRA 候選詞、嚴重程度 (Seriousness)、因果關係 (Causality) 等。
*   💾 **文獻庫管理與匯出 (Database & Export)**
    *   內建「正式文獻庫」管理介面，支援將確認無誤的文獻匯入保存。
    *   提供強大的**多欄位模糊搜尋**與日期區間過濾功能。
    *   支援一鍵將篩選後的文獻資料**匯出為 CSV 報表**，方便後續稽核與歸檔。

## 🆕 進階功能 (v4)

*   📄 **CIOMS-I / E2B(R3) 草稿產生**
    *   在文獻詳情頁一鍵由結構化數據產生 **CIOMS-I 個案安全報告草稿**，含 E2B(R3) 關鍵資料元素對照（如 `E.i.2.1b MedDRA PT`、`G.k.2.2 Active substance`）。
    *   純離線映射、可複製或下載為 `.txt`。⚠️ 產出為草稿，需藥安人員審閱補全後方可提交。
*   📈 **安全訊號聚合 (Signal Aggregation)**
    *   新增「訊號聚合」頁籤，將正式庫依 **成分 × MedDRA PT** 分組計數，標示嚴重個案與潛在訊號（計數 ≥ 3 或含嚴重個案）。
*   🧬 **MedDRA 對照層**
    *   內建常見 PV 事件的 **PT → SOC 種子詞典**，離線校驗 AI 猜測的 PT 並補上系統器官分類。⚠️ 完整 MedDRA 為授權詞典，需自行擴充或接授權來源。
*   ⚡ **批次並行 + 進度顯示**
    *   AI 評分/摘要改為**並行分批**（大幅縮短一輪時間），並在頂部顯示即時進度條。
    *   正式庫支援**批次結構化抽取**未抽取文獻，供訊號聚合使用。
*   💽 **IndexedDB 持久化**
    *   正式庫與「待核閱清單」改存 **IndexedDB**（容量遠大於 localStorage），重新整理不遺失；首次載入自動從舊 localStorage 遷移。
*   🔎 **PubMed 分頁**：檢索可設定「最多取回筆數」（分頁上限，預設 100），efetch 自動分批抓取。
*   🛡️ **後端速率限制**：Worker proxy 內建 KV 固定窗速率限制（每 IP 每分鐘上限），保護金鑰額度。

## 🧪 測試 (Testing)

核心純函式（`parseJsonLoose`、`reconcile`、MedDRA 對照、CIOMS 映射、訊號聚合）皆有單元測試：
```bash
npm test        # vitest 執行單元測試
npm run typecheck  # tsc --noEmit 型別檢查
```

## 🛠️ 技術棧 (Tech Stack)

*   **前端框架**: React 19, TypeScript, Vite
*   **UI 樣式**: Tailwind CSS, Heroicons
*   **AI 引擎**: 任何 OpenAI 相容的 Chat Completions API（provider 無關，不綁定任何廠商 SDK）
*   **資料來源**: NCBI PubMed E-utilities API

## 🚀 快速開始 (Getting Started)

### 1. 安裝依賴
請確保您的環境已安裝 Node.js，然後執行以下指令安裝所需套件：
```bash
npm install
```

### 2. 環境變數設定
將 `.env.example` 複製為 `.env.local`。**本機開發**時可讓前端直接指向任一 OpenAI 相容端點：
```env
VITE_LLM_BASE_URL=https://api.openai.com/v1
VITE_LLM_API_KEY=sk-xxxx
VITE_LLM_MODEL=gpt-4o-mini
```
> ⚠️ `VITE_` 開頭的變數會被打包進前端 bundle——本機自用沒問題，但**不適合公開部署**。要公開/多人使用，請改用後端 proxy（見下方「部署」），前端只設 `VITE_PV_PROXY_ENDPOINT`，金鑰留在伺服器端。

### 3. 啟動開發伺服器
```bash
npm run dev
```
啟動後，請在瀏覽器開啟 `http://localhost:3000` 即可開始使用。

## 📖 使用指南 (Usage Guide)

1.  **檢索設定**: 進入「檢索設定」頁籤，輸入您要監測的目標成分（多個成分請用逗號分隔，如 `Aspirin, Ibuprofen`），並設定監測的日期區間。
2.  **啟動任務**: 點擊右上角的「啟動新監測任務」。系統會自動向 PubMed 發出請求，並過濾掉已經存在於正式庫中的文獻。
3.  **待核閱**: 任務完成後，系統會自動切換至「待核閱」頁籤。您可以在此查看 AI 生成的中文摘要與臨床結論。
4.  **確認匯入**: 確認文獻內容具備 PV 價值後，點擊「確認匯入正式庫」。
5.  **正式庫管理**: 在「正式庫」頁籤中，您可以搜尋歷史紀錄，並點擊右上角的「匯出 CSV 報表」來下載資料。

## 🔌 LLM 供應商（OpenAI 相容）

AI 層（`services/llmService.ts`）是 provider 無關的：它走標準 **OpenAI Chat Completions** 格式，因此 OpenAI、Azure OpenAI、Ollama、OpenRouter、Kimi、LiteLLM 或任何相容網關都能接——只改環境變數，不動程式碼。

要換供應商，把 `VITE_LLM_BASE_URL` / `VITE_LLM_MODEL`（本機）或 Worker 的 `LLM_BASE_URL` / `LLM_MODEL`（proxy）指向你的服務即可。範例：

| 供應商 | Base URL | 範例模型 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `moonshotai/kimi-k2` |
| Ollama（本地） | `http://localhost:11434/v1` | `llama3.1` |

## 🚀 部署（公開 / 多人使用）

為避免把任何 API 金鑰送進瀏覽器，請部署 `worker/` 內的薄 proxy（Cloudflare Worker）——金鑰留在伺服器端，由它把 prompt 轉發給你選用的 OpenAI 相容端點。

```bash
cd worker
npx wrangler secret put LLM_API_KEY   # 將上游金鑰存成 secret
npx wrangler secret put PROXY_TOKEN   # 與前端 VITE_PV_PROXY_TOKEN 同值，防開放式代理
npx wrangler kv namespace create RATE_LIMIT   # 建速率限制 KV，將回傳 id 填入 wrangler.toml
npx wrangler deploy                    # LLM_BASE_URL / LLM_MODEL 於 wrangler.toml 設定
```
接著在前端把 `VITE_PV_PROXY_ENDPOINT` 設為部署後的 Worker URL 並重新 build。此時前端**不含**任何 LLM 金鑰。速率限制的 KV 未綁定時 Worker 會自動略過、照常運作。

## 📄 授權條款 (License)
MIT License
