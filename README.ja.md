[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

---

# PV-Link: ファーマコビジランス・エージェント・システム (Pharmacovigilance Agent System)

![React](https://img.shields.io/badge/React-19-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg) ![Gemini AI](https://img.shields.io/badge/AI-Google_Gemini-orange.svg)

**PV-Link** は、ファーマコビジランス (Pharmacovigilance, PV) のために構築された専門的な自動化エージェントシステムです。従来の手動による文献レビューの時間の浪費と見落としの問題を解決することを目的としています。公式の文献データベースと大規模言語モデル (LLM) を統合することで、検索、スコアリング、要約から構造化データの抽出まで、オールインワンのソリューションを提供します。

## ✨ 主な機能 (Core Features)

*   🔍 **正確な文献検索 (Deterministic Search)**
    *   **NCBI PubMed E-utilities 公式 API** と直接連携し、検索結果の絶対的な精度と再現性を確保します。
    *   **複数の対象成分**の同時検索をサポート（例：`Fenofibrate, Aspirin`）。正確な PubMed クエリ構文に自動変換されます。
    *   カスタム監視期間の設定をサポート。
*   🤖 **AI スコアリングと要約 (AI Scoring & Summarization)**
    *   **Google Gemini 3 Flash** モデルを統合し、新規文献の PV 関連性スコア (0〜100) を超高速で評価します。
    *   難解な英語の医学要約を読みやすい言語に自動翻訳します。
    *   医薬品安全性監視に最も重要な **「臨床的結論 (Key Conclusion)」** を独自に抽出し、ワンクリックコピーをサポートします。
*   📊 **構造化データ抽出 (Structured Data Extraction)**
    *   対象成分、有害事象の記述 (AE Verbatim)、MedDRA 候補用語、重篤度 (Seriousness)、因果関係 (Causality) など、文献から重要な PV データを自動的に抽出します。
*   💾 **データベース管理とエクスポート (Database & Export)**
    *   確認済みの文献をインポートして保存できる「マスターデータベース」管理インターフェースを内蔵。
    *   強力な**複数フィールドのあいまい検索**と日付範囲フィルタリング機能を提供。
    *   フィルタリングされた文献データの **CSV レポートエクスポート** をワンクリックでサポートし、その後の監査とアーカイブを容易にします。

## 🛠️ 技術スタック (Tech Stack)

*   **フロントエンド**: React 19, TypeScript, Vite
*   **UI スタイリング**: Tailwind CSS, Heroicons
*   **AI エンジン**: Google Gen AI SDK (`@google/genai`)
*   **データソース**: NCBI PubMed E-utilities API

## 🚀 クイックスタート (Getting Started)

### 1. 依存関係のインストール
環境に Node.js がインストールされていることを確認し、次のコマンドを実行して必要なパッケージをインストールします。
```bash
npm install
```

### 2. 環境変数の設定
プロジェクトのルートディレクトリに `.env.local` ファイルを作成し、Google Gemini API キーを入力します。
```env
GEMINI_API_KEY=your_api_key_here
```

### 3. 開発サーバーの起動
```bash
npm run dev
```
起動後、ブラウザで `http://localhost:3000` を開いて使用を開始します。

## 📖 使用ガイド (Usage Guide)

1.  **検索設定**: 「検索設定」タブに移動し、監視する対象成分を入力し（複数の成分はコンマで区切ります。例：`Aspirin, Ibuprofen`）、監視期間を設定します。
2.  **タスク開始**: 右上の「新規監視タスクを開始」をクリックします。システムは自動的に PubMed にリクエストを送信し、マスターデータベースにすでに存在する文献を除外します。
3.  **レビュー待ち**: タスクが完了すると、システムは自動的に「レビュー待ち」タブに切り替わります。ここで、AI が生成した要約と臨床的結論を確認できます。
4.  **インポートの確認**: 文献の内容に PV 価値があることを確認したら、「マスターデータベースへのインポートを確認」をクリックします。
5.  **マスターデータベース管理**: 「マスターデータベース」タブでは、履歴レコードを検索し、右上の「CSV レポートをエクスポート」をクリックしてデータをダウンロードできます。

## 🔌 マルチ LLM 統合ガイド (Multi-LLM Integration Guide)

このシステムは現在、デフォルトで Google Gemini API を使用しています。他の AI ソース（OpenAI、Claude、xAI、Ollama、OpenRouter など）に拡張または置換する場合は、次の 2 つのアーキテクチャ戦略をお勧めします。

### 戦略 1: 統合 API ゲートウェイの使用 (最速・推奨)
さまざまなモデルをすばやくサポートしたい場合、最も簡単な方法は、**OpenRouter** やローカルの **Ollama** / **LiteLLM** など、「OpenAI 互換 API」形式をサポートするプロキシサービスを使用することです。
1. OpenAI 公式 SDK をインストールします: `npm install openai`
2. `services/` の下に新しい Service を作成し、Base URL をターゲットサービスに向けます。
   ```typescript
   import OpenAI from 'openai';
   
   const openai = new OpenAI({
     baseURL: "https://openrouter.ai/api/v1", // または http://localhost:11434/v1 (Ollama)
     apiKey: process.env.OPENROUTER_API_KEY,
   });
   
   // 呼び出し時にモデル名を変更するだけです
   // model: "anthropic/claude-3-opus" または "xai/grok-1" または "llama3"
   ```

### 戦略 2: Adapter パターンの実装 (詳細なカスタマイズ向け)
異なるモデルに対して詳細なカスタマイズが必要な場合（特定のモデルで Function Calling や JSON Schema の形式が異なる場合など）、`services/` ディレクトリの下に抽象化レイヤーを実装します。
1. **インターフェースの定義 (Interface)**: `scoreRelevance`、`generateSummaries`、`extractPVData` などのコアメソッドを定義する `IAIService` インターフェースを作成します。
2. **サービスの実装 (Implementations)**: 
   - 既存の `PVGeminiService.ts` を保持します。
   - `OpenAIService.ts` を追加します (`openai` パッケージを使用)。
   - `ClaudeService.ts` を追加します (`@anthropic-ai/sdk` を使用)。
3. **依存性の注入 (DI) / Factory パターン**: `App.tsx` で、ユーザー設定（環境変数または UI ドロップダウン）に基づいて、対応する Service を動的にインスタンス化します。例: `const aiService = AIFactory.create(process.env.AI_PROVIDER);`

## 📄 ライセンス (License)
MIT License
