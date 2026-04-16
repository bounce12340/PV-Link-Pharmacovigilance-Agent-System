[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

---

# PV-Link: 药品安全监测代理系统 (Pharmacovigilance Agent System)

![React](https://img.shields.io/badge/React-19-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg) ![Gemini AI](https://img.shields.io/badge/AI-Google_Gemini-orange.svg)

**PV-Link** 是一个专为药品安全监视 (Pharmacovigilance, PV) 打造的专业自动化代理系统。本系统旨在解决传统人工文献审查耗时且容易遗漏的问题，透过串接官方文献数据库与大型语言模型 (LLM)，提供从检索、评分、摘要到结构化数据抽取的一站式解决方案。

## ✨ 核心功能 (Core Features)

*   🔍 **精准文献检索 (Deterministic Search)**
    *   直接串接 **NCBI PubMed E-utilities 官方 API**，确保检索结果的绝对精确性与可重现性。
    *   支持**复数目标成分**同时检索（例如：`Fenofibrate, Aspirin`），自动转换为精确的 PubMed 查询语法。
    *   支持自定义监测日期区间。
*   🤖 **AI 智能评分与摘要 (AI Scoring & Summarization)**
    *   整合 **Google Gemini 3 Flash** 模型，以极高的速度对新进文献进行 PV 关联性评分 (0-100分)。
    *   自动将生硬的英文医学摘要，转化为易读的**中文摘要**。
    *   独立提炼出对药安监测最重要的**“临床结论 (Key Conclusion)”**，并支持一键复制。
*   📊 **结构化数据抽取 (Structured Data Extraction)**
    *   自动从文献中提取关键 PV 数据，包含：目标成分、不良反应描述 (AE Verbatim)、MedDRA 候选词、严重程度 (Seriousness)、因果关系 (Causality) 等。
*   💾 **文献库管理与导出 (Database & Export)**
    *   内置“正式文献库”管理界面，支持将确认无误的文献导入保存。
    *   提供强大的**多字段模糊搜索**与日期区间过滤功能。
    *   支持一键将筛选后的文献数据**导出为 CSV 报表**，方便后续稽核与归档。

## 🛠️ 技术栈 (Tech Stack)

*   **前端框架**: React 19, TypeScript, Vite
*   **UI 样式**: Tailwind CSS, Heroicons
*   **AI 引擎**: Google Gen AI SDK (`@google/genai`)
*   **数据来源**: NCBI PubMed E-utilities API

## 🚀 快速开始 (Getting Started)

### 1. 安装依赖
请确保您的环境已安装 Node.js，然后执行以下指令安装所需套件：
```bash
npm install
```

### 2. 环境变量设定
在项目根目录建立一个 `.env.local` 文件，并填入您的 Google Gemini API Key：
```env
GEMINI_API_KEY=your_api_key_here
```

### 3. 启动开发服务器
```bash
npm run dev
```
启动后，请在浏览器打开 `http://localhost:3000` 即可开始使用。

## 📖 使用指南 (Usage Guide)

1.  **检索设定**: 进入“检索设定”标签页，输入您要监测的目标成分（多个成分请用逗号分隔，如 `Aspirin, Ibuprofen`），并设定监测的日期区间。
2.  **启动任务**: 点击右上角的“启动新监测任务”。系统会自动向 PubMed 发出请求，并过滤掉已经存在于正式库中的文献。
3.  **待核阅**: 任务完成后，系统会自动切换至“待核阅”标签页。您可以在此查看 AI 生成的中文摘要与临床结论。
4.  **确认导入**: 确认文献内容具备 PV 价值后，点击“确认导入正式库”。
5.  **正式库管理**: 在“正式库”标签页中，您可以搜索历史纪录，并点击右上角的“导出 CSV 报表”来下载数据。

## 🔌 多模型 AI 来源串接指南 (Multi-LLM Integration Guide)

本系统目前默认使用 Google Gemini API。若您希望扩充或替换为其他 AI 来源（如 OpenAI, Claude, xAI, Ollama, OpenRouter 等），建议采用以下两种架构策略来进行修改：

### 策略一：使用统一 API 网关 (最快速推荐)
如果您想快速支持各种模型，最简单的方式是使用支持“OpenAI 兼容格式 (OpenAI-compatible API)”的代理服务，例如 **OpenRouter** 或是本地端的 **Ollama** / **LiteLLM**。
1. 安装 OpenAI 官方 SDK：`npm install openai`
2. 在 `services/` 下建立新的 Service，并将 Base URL 指向目标服务：
   ```typescript
   import OpenAI from 'openai';
   
   const openai = new OpenAI({
     baseURL: "https://openrouter.ai/api/v1", // 或 http://localhost:11434/v1 (Ollama)
     apiKey: process.env.OPENROUTER_API_KEY,
   });
   
   // 调用时只需抽换 model 名称即可
   // model: "anthropic/claude-3-opus" 或 "xai/grok-1" 或 "llama3"
   ```

### 策略二：实现 Adapter 设计模式 (适合深度定制化)
若需要针对不同模型进行深度定制化（例如特定模型的 Function Calling 或 JSON Schema 格式不同），请在 `services/` 目录下实现抽象层：
1. **定义接口 (Interface)**: 建立 `IAIService` 接口，定义 `scoreRelevance`, `generateSummaries`, `extractPVData` 等核心方法。
2. **实现服务 (Implementations)**: 
   - 保留现有的 `PVGeminiService.ts`
   - 新增 `OpenAIService.ts` (使用 `openai` 套件)
   - 新增 `ClaudeService.ts` (使用 `@anthropic-ai/sdk`)
3. **依赖注入 (DI) / 工厂模式 (Factory)**: 在 `App.tsx` 中，根据用户的设定 (环境变量或 UI 下拉菜单) 动态实例化对应的 Service。例如：`const aiService = AIFactory.create(process.env.AI_PROVIDER);`

## 📄 授权条款 (License)
MIT License
