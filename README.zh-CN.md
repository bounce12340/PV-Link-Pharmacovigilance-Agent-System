[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

---

# PV-Link: 药品安全监测代理系统 (Pharmacovigilance Agent System)

![React](https://img.shields.io/badge/React-19-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg) ![OpenAI-compatible](https://img.shields.io/badge/AI-OpenAI--compatible-green.svg)

**PV-Link** 是一个专为药品安全监视 (Pharmacovigilance, PV) 打造的专业自动化代理系统。本系统旨在解决传统人工文献审查耗时且容易遗漏的问题，透过串接官方文献数据库与大型语言模型 (LLM)，提供从检索、评分、摘要到结构化数据抽取的一站式解决方案。

## ✨ 核心功能 (Core Features)

*   🔍 **精准文献检索 (Deterministic Search)**
    *   直接串接 **NCBI PubMed E-utilities 官方 API**，确保检索结果的绝对精确性与可重现性。
    *   支持**复数目标成分**同时检索（例如：`Fenofibrate, Aspirin`），自动转换为精确的 PubMed 查询语法。
    *   支持自定义监测日期区间。
*   🤖 **AI 智能评分与摘要 (AI Scoring & Summarization)**
    *   可串接任何 **OpenAI 兼容的 Chat Completions 端点**（OpenAI、Azure OpenAI、Ollama、OpenRouter、Kimi…），对新进文献进行 PV 关联性评分 (0-100分)。
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
*   **AI 引擎**: 任何 OpenAI 兼容的 Chat Completions API（provider 无关，不绑定任何厂商 SDK）
*   **数据来源**: NCBI PubMed E-utilities API

## 🚀 快速开始 (Getting Started)

### 1. 安装依赖
请确保您的环境已安装 Node.js，然后执行以下指令安装所需套件：
```bash
npm install
```

### 2. 环境变量设定
将 `.env.example` 复制为 `.env.local`。**本机开发**时可让前端直接指向任一 OpenAI 兼容端点：
```env
VITE_LLM_BASE_URL=https://api.openai.com/v1
VITE_LLM_API_KEY=sk-xxxx
VITE_LLM_MODEL=gpt-4o-mini
```
> ⚠️ `VITE_` 开头的变量会被打包进前端 bundle——本机自用没问题，但**不适合公开部署**。要公开/多人使用，请改用后端 proxy（见下方「部署」），前端只设 `VITE_PV_PROXY_ENDPOINT`，密钥留在服务器端。

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

## 🔌 LLM 供应商（OpenAI 兼容）

AI 层（`services/llmService.ts`）是 provider 无关的：它走标准 **OpenAI Chat Completions** 格式，因此 OpenAI、Azure OpenAI、Ollama、OpenRouter、Kimi、LiteLLM 或任何兼容网关都能接——只改环境变量，不用动代码。

要换供应商，把 `VITE_LLM_BASE_URL` / `VITE_LLM_MODEL`（本机）或 Worker 的 `LLM_BASE_URL` / `LLM_MODEL`（proxy）指向你的服务即可。示例：

| 供应商 | Base URL | 示例模型 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `moonshotai/kimi-k2` |
| Ollama（本地） | `http://localhost:11434/v1` | `llama3.1` |

## 🚀 部署（公开 / 多人使用）

为避免把任何 API 密钥送进浏览器，请部署 `worker/` 内的薄 proxy（Cloudflare Worker）——密钥留在服务器端，由它把 prompt 转发给你选用的 OpenAI 兼容端点。

```bash
cd worker
npx wrangler secret put LLM_API_KEY   # 将上游密钥存成 secret
npx wrangler deploy                    # LLM_BASE_URL / LLM_MODEL 于 wrangler.toml 设定
```
接着在前端把 `VITE_PV_PROXY_ENDPOINT` 设为部署后的 Worker URL 并重新 build。此时前端**不含**任何 LLM 密钥。

## 📄 授权条款 (License)
MIT License
