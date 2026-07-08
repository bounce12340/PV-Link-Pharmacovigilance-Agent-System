[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

---

# PV-Link: Pharmacovigilance Agent System

![React](https://img.shields.io/badge/React-19-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg) ![OpenAI-compatible](https://img.shields.io/badge/AI-OpenAI--compatible-green.svg)

**PV-Link** is a professional automated agent system built specifically for Pharmacovigilance (PV). This system aims to solve the time-consuming and error-prone nature of traditional manual literature reviews. By integrating official literature databases with Large Language Models (LLMs), it provides an all-in-one solution from retrieval, scoring, and summarization to structured data extraction.

## ✨ Core Features

*   🔍 **Deterministic Search**
    *   Directly integrates with the **NCBI PubMed E-utilities official API**, ensuring absolute precision and reproducibility of search results.
    *   Supports simultaneous search for **multiple target ingredients** (e.g., `Fenofibrate, Aspirin`), automatically converting them into precise PubMed query syntax.
    *   Supports custom monitoring date ranges.
*   🤖 **AI Scoring & Summarization**
    *   Talks to any **OpenAI-compatible Chat Completions endpoint** (OpenAI, Azure OpenAI, Ollama, OpenRouter, Kimi, …) to rapidly evaluate the PV relevance (score 0-100) of incoming literature.
    *   Automatically translates complex English medical abstracts into easy-to-read summaries.
    *   Independently extracts the **"Key Conclusion"**, which is crucial for drug safety monitoring, and supports one-click copying.
*   📊 **Structured Data Extraction**
    *   Automatically extracts key PV data from literature, including: Target Ingredient, Adverse Event (AE) Verbatim, MedDRA Candidate Terms, Seriousness, Causality, etc.
*   💾 **Database Management & Export**
    *   Built-in "Master Database" management interface, supporting the import and preservation of verified literature.
    *   Provides powerful **multi-field fuzzy search** and date range filtering.
    *   Supports one-click **CSV report export** of filtered literature data for subsequent auditing and archiving.

## 🆕 Advanced Features (v4)

*   📄 **CIOMS-I / E2B(R3) Draft Generation**
    *   Generate a **CIOMS-I Individual Case Safety Report draft** with one click from structured data on the literature detail page, including E2B(R3) key data element mapping (e.g., `E.i.2.1b MedDRA PT`, `G.k.2.2 Active substance`).
    *   Pure offline mapping; copy or download as `.txt`. ⚠️ Output is a draft — it must be reviewed and completed by PV staff before submission.
*   📈 **Safety Signal Aggregation**
    *   New "Signal Aggregation" tab groups and counts the master database by **Ingredient × MedDRA PT**, flagging serious cases and potential signals (count ≥ 3 or containing a serious case).
*   🧬 **MedDRA Mapping Layer**
    *   Built-in **PT → SOC seed dictionary** for common PV events, offline-validating AI-guessed PTs and filling in the System Organ Class. ⚠️ The full MedDRA dictionary is licensed — extend it yourself or connect a licensed source.
*   ⚡ **Batch Parallelism + Progress Display**
    *   AI scoring/summarization now runs in **parallel batches** (significantly shortening each round), with a live progress bar shown at the top.
    *   The master database supports **batch structured extraction** for unextracted literature, for use in signal aggregation.
*   💽 **IndexedDB Persistence**
    *   The master database and "pending review list" are now stored in **IndexedDB** (far larger capacity than localStorage) and survive page refreshes; existing data auto-migrates from localStorage on first load.
*   🔎 **PubMed Pagination**: Search now supports a "max results" setting (pagination cap, default 100), with efetch automatically fetching in batches.
*   🛡️ **Backend Rate Limiting**: The Worker proxy has a built-in KV fixed-window rate limiter (per-IP, per-minute cap) to protect API key quota.

## 🧪 Testing

Core pure functions (`parseJsonLoose`, `reconcile`, MedDRA mapping, CIOMS mapping, signal aggregation) all have unit tests:
```bash
npm test        # run unit tests with vitest
npm run typecheck  # type-check with tsc --noEmit
```

## 🛠️ Tech Stack

*   **Frontend Framework**: React 19, TypeScript, Vite
*   **UI Styling**: Tailwind CSS, Heroicons
*   **AI Engine**: Any OpenAI-compatible Chat Completions API (provider-agnostic; no vendor SDK)
*   **Data Source**: NCBI PubMed E-utilities API

## 🚀 Getting Started

### 1. Install Dependencies
Ensure Node.js is installed in your environment, then run the following command to install required packages:
```bash
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env.local`. For **local development** you can point the frontend directly at any OpenAI-compatible endpoint:
```env
VITE_LLM_BASE_URL=https://api.openai.com/v1
VITE_LLM_API_KEY=sk-xxxx
VITE_LLM_MODEL=gpt-4o-mini
```
> ⚠️ `VITE_`-prefixed keys are bundled into the frontend — fine for local use, **not** for public deployment. For a public/multi-user deployment, use the backend proxy instead (see "Deployment" below) and set only `VITE_PV_PROXY_ENDPOINT`, keeping the key on the server.

### 3. Start Development Server
```bash
npm run dev
```
Once started, open `http://localhost:3000` in your browser to begin using the system.

## 📖 Usage Guide

1.  **Search Settings**: Go to the "Search Settings" tab, enter the target ingredients you want to monitor (separate multiple ingredients with commas, e.g., `Aspirin, Ibuprofen`), and set the monitoring date range.
2.  **Start Task**: Click "Start New Monitoring Task" in the top right corner. The system will automatically send requests to PubMed and filter out literature already existing in the master database.
3.  **Pending Review**: Once the task is complete, the system will automatically switch to the "Pending Review" tab. Here you can view the AI-generated summaries and clinical conclusions.
4.  **Confirm Import**: After confirming the literature has PV value, click "Confirm Import to Master Database".
5.  **Master Database Management**: In the "Master Database" tab, you can search historical records and click "Export CSV Report" in the top right corner to download the data.

## 🔌 LLM Provider (OpenAI-compatible)

The AI layer (`services/llmService.ts`) is provider-agnostic: it speaks the standard **OpenAI Chat Completions** format, so it works with OpenAI, Azure OpenAI, Ollama, OpenRouter, Kimi, LiteLLM, or any compatible gateway — you only change environment variables, no code.

Switch providers by pointing `VITE_LLM_BASE_URL` / `VITE_LLM_MODEL` (local) or the Worker's `LLM_BASE_URL` / `LLM_MODEL` (proxy) at your service. Examples:

| Provider | Base URL | Example model |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `moonshotai/kimi-k2` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.1` |

## 🚀 Deployment (public / multi-user)

To avoid shipping any API key to the browser, deploy the thin proxy in `worker/` (a Cloudflare Worker) — it holds the key server-side and forwards prompts to your chosen OpenAI-compatible endpoint.

```bash
cd worker
npx wrangler secret put LLM_API_KEY   # store the upstream key as a secret
npx wrangler secret put PROXY_TOKEN   # same value as the frontend's VITE_PV_PROXY_TOKEN, prevents an open proxy
npx wrangler kv namespace create RATE_LIMIT   # create the rate-limit KV; put the returned id into wrangler.toml
npx wrangler deploy                    # LLM_BASE_URL / LLM_MODEL are set in wrangler.toml
```
Then set `VITE_PV_PROXY_ENDPOINT` in the frontend to the deployed Worker URL and rebuild. The frontend now carries **no** LLM key. If the rate-limit KV isn't bound, the Worker automatically skips it and works as normal.

## 📄 License
MIT License
