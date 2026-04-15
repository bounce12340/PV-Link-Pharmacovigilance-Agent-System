<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 💊 PV-Link Auditor: Pharmacovigilance Agent System

**PV-Link Auditor** 是一款專為藥物警戒 (Pharmacovigilance) 設計的 AI 稽核系統。它將繁瑣的文獻監測流程（Literature Monitoring）自動化，利用 LLM (Gemini) 的強大分析能力，將海量的 PubMed 數據轉化為可直接用於法規報告的結構化結論。

## 🚀 核心痛點解決
在傳統的 PV 文獻審查中，法規經理面臨：
- **檢索量大**：需在 PubMed 投入大量時間篩選數百篇不相關論文。
- **審查低效**：逐篇閱讀摘要以判斷是否有「安全性訊號 (Safety Signal)」。
- **記錄混亂**：缺乏統一的正式庫來管理已核閱的文獻與結論。

**PV-Link Auditor 將此流程縮短至分鐘級別。**

## ✨ 關鍵功能

### 🔍 1. 智能監測任務 (Smart Monitoring)
- **動態查詢生成**：輸入目標成分 (Active Ingredients)，系統自動構建符合 PubMed 邏輯的布林檢索式 (Boolean Query)。
- **時間窗口過濾**：精確定義監測日期範圍，確保追蹤的時效性。

### 🧠 2. AI 相關性篩選 (Relevance Scoring)
- **自動評分**：AI 快速掃描 PubMed 摘要，根據成分相關性與 AE 描述賦予評分。
- **中文摘要生成**：將複雜的英文學術摘要轉化為精簡的中文摘要與**關鍵結論 (Key Conclusion)**。

### 📋 3. 結構化數據提取 (Structured Extraction)
- **AE 提取**：自動識別文獻中的不良反應 (Adverse Events) 描述。
- **成分校對**：AI 識別文獻實際提及的成分，並與搜尋詞進行對比。

### 🗄️ 4. 專業正式庫管理 (Master Database)
- **核閱工作流**：`待核閱` $\to$ `確認匯入` $\to$ `正式庫` 的嚴謹流程。
- **全域模糊檢索**：支持對 PMID、標題、AI 結論進行秒級搜索。
- **一鍵報表匯出**：支持將所有核閱紀錄匯出為 `.csv` 格式，直接對接法規申報文件。

## 🛠️ 技術棧 (Tech Stack)
- **Frontend**: React + TypeScript + Tailwind CSS + Heroicons
- **AI Engine**: Google Gemini API (via `PVGeminiService`)
- **Data Source**: PubMed API
- **Storage**: LocalStorage (for master database persistence)
- **Build Tool**: Vite

## ⚙️ 快速開始

### 預要求
- Node.js (建議 v18+)
- Google Gemini API Key

### 安裝與執行
1. **克隆項目**:
   ```bash
   git clone https://github.com/bounce12340/PV-Link-Pharmacovigilance-Agent-System.git
   cd PV-Link-Pharmacovigilance-Agent-System
   ```
2. **安裝依賴**:
   ```bash
   npm install
   ```
3. **配置 API Key**:
   在 `.env.local` 文件中添加您的金鑰：
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```
4. **啟動應用**:
   ```bash
   npm run dev
   ```

## 📖 工作流演示
`設定成分` $\to$ `啟動任務` $\to$ `AI 評分/摘要` $\to$ `人工核閱` $\to$ `匯入正式庫` $\to$ `匯出 CSV`

---
Developed for high-standard regulatory compliance and pharmacovigilance excellence.
