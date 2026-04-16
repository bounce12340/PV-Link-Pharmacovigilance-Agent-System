[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

---

# PV-Link: 藥品安全監測代理系統 (Pharmacovigilance Agent System)

![React](https://img.shields.io/badge/React-19-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg) ![Gemini AI](https://img.shields.io/badge/AI-Google_Gemini-orange.svg)

**PV-Link** 是一個專為藥品安全監視 (Pharmacovigilance, PV) 打造的專業自動化代理系統。本系統旨在解決傳統人工文獻審查耗時且容易遺漏的問題，透過串接官方文獻資料庫與大型語言模型 (LLM)，提供從檢索、評分、摘要到結構化數據抽取的一站式解決方案。

## ✨ 核心功能 (Core Features)

*   🔍 **精準文獻檢索 (Deterministic Search)**
    *   直接串接 **NCBI PubMed E-utilities 官方 API**，確保檢索結果的絕對精確性與可重現性。
    *   支援**複數目標成分**同時檢索（例如：`Fenofibrate, Aspirin`），自動轉換為精確的 PubMed 查詢語法。
    *   支援自訂監測日期區間。
*   🤖 **AI 智能評分與摘要 (AI Scoring & Summarization)**
    *   整合 **Google Gemini 3 Flash** 模型，以極高的速度對新進文獻進行 PV 關聯性評分 (0-100分)。
    *   自動將生硬的英文醫學摘要，轉化為易讀的**繁體中文摘要**。
    *   獨立提煉出對藥安監測最重要的**「臨床結論 (Key Conclusion)」**，並支援一鍵複製。
*   📊 **結構化數據抽取 (Structured Data Extraction)**
    *   自動從文獻中提取關鍵 PV 數據，包含：目標成分、不良反應描述 (AE Verbatim)、MedDRA 候選詞、嚴重程度 (Seriousness)、因果關係 (Causality) 等。
*   💾 **文獻庫管理與匯出 (Database & Export)**
    *   內建「正式文獻庫」管理介面，支援將確認無誤的文獻匯入保存。
    *   提供強大的**多欄位模糊搜尋**與日期區間過濾功能。
    *   支援一鍵將篩選後的文獻資料**匯出為 CSV 報表**，方便後續稽核與歸檔。

## 🛠️ 技術棧 (Tech Stack)

*   **前端框架**: React 19, TypeScript, Vite
*   **UI 樣式**: Tailwind CSS, Heroicons
*   **AI 引擎**: Google Gen AI SDK (`@google/genai`)
*   **資料來源**: NCBI PubMed E-utilities API

## 🚀 快速開始 (Getting Started)

### 1. 安裝依賴
請確保您的環境已安裝 Node.js，然後執行以下指令安裝所需套件：
```bash
npm install
```

### 2. 環境變數設定
在專案根目錄建立一個 `.env.local` 檔案，並填入您的 Google Gemini API Key：
```env
GEMINI_API_KEY=your_api_key_here
```

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

## 🔌 多模型 AI 來源串接指南 (Multi-LLM Integration Guide)

本系統目前預設使用 Google Gemini API。若您希望擴充或替換為其他 AI 來源（如 OpenAI, Claude, xAI, Ollama, OpenRouter 等），建議採用以下兩種架構策略來進行修改：

### 策略一：使用統一 API 網關 (最快速推薦)
如果您想快速支援各種模型，最簡單的方式是使用支援「OpenAI 相容格式 (OpenAI-compatible API)」的代理服務，例如 **OpenRouter** 或是本地端的 **Ollama** / **LiteLLM**。
1. 安裝 OpenAI 官方 SDK：`npm install openai`
2. 在 `services/` 下建立新的 Service，並將 Base URL 指向目標服務：
   ```typescript
   import OpenAI from 'openai';
   
   const openai = new OpenAI({
     baseURL: "https://openrouter.ai/api/v1", // 或 http://localhost:11434/v1 (Ollama)
     apiKey: process.env.OPENROUTER_API_KEY,
   });
   
   // 呼叫時只需抽換 model 名稱即可
   // model: "anthropic/claude-3-opus" 或 "xai/grok-1" 或 "llama3"
   ```

### 策略二：實作 Adapter 設計模式 (適合深度客製化)
若需要針對不同模型進行深度客製化（例如特定模型的 Function Calling 或 JSON Schema 格式不同），請在 `services/` 目錄下實作抽象層：
1. **定義介面 (Interface)**: 建立 `IAIService` 介面，定義 `scoreRelevance`, `generateSummaries`, `extractPVData` 等核心方法。
2. **實作服務 (Implementations)**: 
   - 保留現有的 `PVGeminiService.ts`
   - 新增 `OpenAIService.ts` (使用 `openai` 套件)
   - 新增 `ClaudeService.ts` (使用 `@anthropic-ai/sdk`)
3. **依賴注入 (DI) / 工廠模式 (Factory)**: 在 `App.tsx` 中，根據使用者的設定 (環境變數或 UI 下拉選單) 動態實例化對應的 Service。例如：`const aiService = AIFactory.create(process.env.AI_PROVIDER);`

## 📄 授權條款 (License)
MIT License
