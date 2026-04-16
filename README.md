<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 💊 PV-Link Auditor: Pharmacovigilance Agent System

**PV-Link Auditor** 是一款專為藥物警戒 (Pharmacovigilance, PV) 專業人員設計的 AI 稽核系統。它將傳統耗時的文獻監測 (Literature Monitoring) 流程轉化為一個高度自動化的 AI 管道，利用 Gemini LLM 的強大分析能力，將海量醫學文獻轉化為滿足法規申報要求的結構化數據。

## 🚀 核心價值：從「大海撈針」到「精確提取」

| 流程階段 | 傳統人工審查 (Manual) | PV-Link Auditor (AI-Powered) | 效率提升 |
| :--- | :--- | :--- | :---: |
| **文獻檢索** | 在 PubMed 手動輸入多組關鍵詞，處理數百筆結果 | **自動化生成布林檢索式**，一鍵獲取精確結果 | ⚡ 10x |
| **相關性篩選** | 逐篇閱讀英文摘要，人工判定是否相關 | **AI 相關性評分 + 中文快速摘要**，僅核閱高分文獻 | ⚡ 20x |
| **數據提取** | 手動將 AE 描述、成分、日期抄錄至 Excel | **結構化 AE 數據提取**，自動對齊成分與結論 | ⚡ 15x |
| **庫存管理** | 碎片化的 Word/Excel 記錄，難以快速檢索 | **集中式正式庫 (Master DB)**，支持全域模糊搜索與 CSV 匯出 | ⚡ 5x |

## ✨ 核心功能詳解

### 🔍 智能監測任務 (Smart Monitoring)
- **動態查詢引擎**：輸入目標成分，系統自動構建符合 PubMed 語法的 `(Ingredient) AND (Adverse реакции OR Pharmacovigilance*)` 邏輯。
- **時間窗口精控**：支持定義精確的監測起始與結束日期，確保不遺漏任何新發佈的安全性訊號。

### 🧠 AI 相關性度量 (Relevance Scoring)
- **多維度評分**：AI 根據「成分匹配度」、「安全性訊號強度」與「臨床相關性」賦予 score。
- **結論轉譯**：將深奧的英語學術術語轉譯為**法規可接受的中文結論 (Key Conclusion)**。

### 📋 結構化 AE 數據提取 (Structured Data Extraction)
系統不僅提供摘要，還能提取以下關鍵結構化欄位：
- `Ingredient`: 實際被提及的成分 (與搜尋詞比對)。
- `AE Verbatim`: 原始的不良反應描述。
- `Conclusion_ZH`: 針對該個案的臨床結論。
- `Quality_Flag`: 標記是否經過人工核閱 (PRO_VERIFIED) 或已入庫 (DB_COMMITTED)。

### 🗄️ 專業正式庫管理 (Master Database)
- **嚴謹核閱流**：`檢索` $\rightarrow$ `待核閱` $\rightarrow$ `確認匯入` $\rightarrow$ `正式庫`。
- **數據完整性**：防止重複匯入 (PMID 唯一性校驗)，支持一鍵匯出 `.csv` 報表直接提交法規審查。

## 🛠️ 技術架構 (Architecture)
- **Frontend**: `React 18` + `TypeScript` + `Tailwind CSS` (現代化磨砂玻璃 UI)
- **AI Intelligence**: `Google Gemini API` (處理長文本摘要與結構化提取)
- **Data Pipeline**: `PubMed API` $\rightarrow$ `LLM Processing` $\rightarrow$ `LocalStorage Persistence`
- **Build System**: `Vite`

## ⚙️ 部署與快速開始

### 1. 環境要求
- **Node.js**: v18.0.0 或更高版本
- **API Key**: 需申請 Google Gemini API Key

### 2. 安裝步驟
```bash
# 克隆倉庫
git clone https://github.com/bounce12340/PV-Link-Pharmacovigilance-Agent-System.git
cd PV-Link-Pharmacovigilance-Agent-System

# 安裝依賴
npm install
```

### 3. 配置與啟動
- 在根目錄創建 `.env.local` 文件：
  ```env
  GEMINI_API_KEY=你的_GEMINI_API_金鑰
  ```
- 啟動開發伺服器：
  ```bash
  npm run dev
  ```

## 📖 使用指南
1. **配置** $\rightarrow$ 在「檢索設定」輸入目標成分（如 `Fenofibrate`）。
2. **執行** $\rightarrow$ 點擊「啟動新監測任務」。
3. **核閱** $\rightarrow$ 在「待核閱」分頁查看 AI 生成的結論 $\rightarrow$ 點擊「確認匯入正式庫」。
4. **報表** $\rightarrow$ 在「正式文獻庫」使用篩選功能 $\rightarrow$ 點擊「匯出 CSV 報表」。

---
**Developed for High-Standard Regulatory Compliance & Pharmacovigilance Excellence.**
