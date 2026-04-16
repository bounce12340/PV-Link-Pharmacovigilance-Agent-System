[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

---

# PV-Link: Pharmacovigilance Agent System

![React](https://img.shields.io/badge/React-19-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg) ![Gemini AI](https://img.shields.io/badge/AI-Google_Gemini-orange.svg)

**PV-Link** is a professional automated agent system built specifically for Pharmacovigilance (PV). This system aims to solve the time-consuming and error-prone nature of traditional manual literature reviews. By integrating official literature databases with Large Language Models (LLMs), it provides an all-in-one solution from retrieval, scoring, and summarization to structured data extraction.

## ✨ Core Features

*   🔍 **Deterministic Search**
    *   Directly integrates with the **NCBI PubMed E-utilities official API**, ensuring absolute precision and reproducibility of search results.
    *   Supports simultaneous search for **multiple target ingredients** (e.g., `Fenofibrate, Aspirin`), automatically converting them into precise PubMed query syntax.
    *   Supports custom monitoring date ranges.
*   🤖 **AI Scoring & Summarization**
    *   Integrates the **Google Gemini 3 Flash** model to rapidly evaluate the PV relevance (score 0-100) of incoming literature.
    *   Automatically translates complex English medical abstracts into easy-to-read summaries.
    *   Independently extracts the **"Key Conclusion"**, which is crucial for drug safety monitoring, and supports one-click copying.
*   📊 **Structured Data Extraction**
    *   Automatically extracts key PV data from literature, including: Target Ingredient, Adverse Event (AE) Verbatim, MedDRA Candidate Terms, Seriousness, Causality, etc.
*   💾 **Database Management & Export**
    *   Built-in "Master Database" management interface, supporting the import and preservation of verified literature.
    *   Provides powerful **multi-field fuzzy search** and date range filtering.
    *   Supports one-click **CSV report export** of filtered literature data for subsequent auditing and archiving.

## 🛠️ Tech Stack

*   **Frontend Framework**: React 19, TypeScript, Vite
*   **UI Styling**: Tailwind CSS, Heroicons
*   **AI Engine**: Google Gen AI SDK (`@google/genai`)
*   **Data Source**: NCBI PubMed E-utilities API

## 🚀 Getting Started

### 1. Install Dependencies
Ensure Node.js is installed in your environment, then run the following command to install required packages:
```bash
npm install
```

### 2. Environment Variables
Create a `.env.local` file in the project root and enter your Google Gemini API Key:
```env
GEMINI_API_KEY=your_api_key_here
```

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

## 🔌 Multi-LLM Integration Guide

This system currently uses the Google Gemini API by default. If you wish to expand or replace it with other AI sources (such as OpenAI, Claude, xAI, Ollama, OpenRouter, etc.), we recommend the following two architectural strategies:

### Strategy 1: Use a Unified API Gateway (Fastest & Recommended)
If you want to quickly support various models, the simplest way is to use a proxy service that supports the "OpenAI-compatible API" format, such as **OpenRouter** or a local **Ollama** / **LiteLLM** instance.
1. Install the official OpenAI SDK: `npm install openai`
2. Create a new Service under `services/` and point the Base URL to the target service:
   ```typescript
   import OpenAI from 'openai';
   
   const openai = new OpenAI({
     baseURL: "https://openrouter.ai/api/v1", // or http://localhost:11434/v1 (Ollama)
     apiKey: process.env.OPENROUTER_API_KEY,
   });
   
   // Just swap the model name when calling
   // model: "anthropic/claude-3-opus" or "xai/grok-1" or "llama3"
   ```

### Strategy 2: Implement the Adapter Pattern (For Deep Customization)
If deep customization is required for different models (e.g., specific models have different Function Calling or JSON Schema formats), implement an abstraction layer under the `services/` directory:
1. **Define Interface**: Create an `IAIService` interface defining core methods like `scoreRelevance`, `generateSummaries`, `extractPVData`.
2. **Implementations**: 
   - Keep the existing `PVGeminiService.ts`
   - Add `OpenAIService.ts` (using the `openai` package)
   - Add `ClaudeService.ts` (using `@anthropic-ai/sdk`)
3. **Dependency Injection (DI) / Factory Pattern**: In `App.tsx`, dynamically instantiate the corresponding Service based on user settings (environment variables or UI dropdown). For example: `const aiService = AIFactory.create(process.env.AI_PROVIDER);`

## 📄 License
MIT License
