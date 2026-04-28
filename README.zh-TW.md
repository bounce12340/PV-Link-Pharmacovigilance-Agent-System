[English](README.md) | **繁體中文** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

---

# PV-Link：藥品安全監視代理系統

![React](https://img.shields.io/badge/React-19-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg) ![Gemini AI](https://img.shields.io/badge/AI-Google_Gemini-orange.svg)

**PV-Link** 是一套專為藥品安全監視（Pharmacovigilance, PV）設計的全自動代理系統。本系統整合官方文獻資料庫與大型語言模型（LLM），提供從文獻檢索、AI 評分、摘要生成到結構化資料擷取的一站式解決方案，解決傳統人工文獻回顧耗時且容易出錯的問題。

## ✨ 核心功能

### 🔍 確定性文獻搜尋
- 直接串接 **NCBI PubMed E-utilities 官方 API**，確保搜尋結果的精確性與可重現性
- 支援**同時監測多個成分**（例如：`Fenofibrate, Aspirin`），自動轉換為 PubMed 精確查詢語法
- 支援自訂監測日期區間

### 🤖 AI 評分與摘要
- 整合 **Google Gemini 3 Flash** 模型，快速評估文獻的 PV 相關性（0–100 分）
- 自動將複雜的英文醫學摘要翻譯為易讀摘要
- 獨立擷取藥品安全監視最關鍵的**「核心結論」**，支援一鍵複製

### 📊 結構化資料擷取
自動擷取文獻中的關鍵 PV 資料：
- 目標成分、AE 逐字描述
- MedDRA 候選術語、嚴重性、因果關係等

### 💾 資料庫管理與匯出
- 內建「Master 資料庫」管理介面，支援已驗證文獻的匯入與保存
- 強大的**多欄位模糊搜尋**與日期範圍篩選
- 支援一鍵匯出 **CSV 報告**，便於後續稽核與歸檔

## 🛠️ 技術架構

| 層級 | 技術 |
|------|------|
| 前端框架 | React 19、TypeScript、Vite |
| UI 樣式 | Tailwind CSS、Heroicons |
| AI 引擎 | Google Gen AI SDK（`@google/genai`） |
| 資料來源 | NCBI PubMed E-utilities API |

## 🚀 快速開始

### 1. 安裝相依套件
確認已安裝 Node.js，執行：
```bash
npm install
```

### 2. 設定環境變數
在專案根目錄建立 `.env.local` 並填入 Google Gemini API Key：
```env
GEMINI_API_KEY=your_api_key_here
```

### 3. 啟動開發伺服器
```bash
npm run dev
```
啟動後，在瀏覽器開啟 `http://localhost:3000` 即可使用。

## 📖 使用流程

1. **搜尋設定**：在「Search Settings」頁籤填入監測目標成分（多個成分以逗號分隔），設定監測日期區間
2. **啟動任務**：點選右上角「Start New Monitoring Task」，系統自動向 PubMed 發送請求並過濾 Master 資料庫中已存在的文獻
3. **待審閱清單**：任務完成後自動切換至「Pending Review」，可檢視 AI 生成的摘要與臨床結論
4. **確認匯入**：確認文獻具有 PV 價值後，點選「Confirm Import to Master Database」

## 📄 授權

MIT License — 免費使用、修改與發佈。
