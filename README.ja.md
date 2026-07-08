[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

---

# PV-Link: ファーマコビジランス・エージェント・システム (Pharmacovigilance Agent System)

![React](https://img.shields.io/badge/React-19-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg) ![OpenAI-compatible](https://img.shields.io/badge/AI-OpenAI--compatible-green.svg)

**PV-Link** は、ファーマコビジランス (Pharmacovigilance, PV) のために構築された専門的な自動化エージェントシステムです。従来の手動による文献レビューの時間の浪費と見落としの問題を解決することを目的としています。公式の文献データベースと大規模言語モデル (LLM) を統合することで、検索、スコアリング、要約から構造化データの抽出まで、オールインワンのソリューションを提供します。

## ✨ 主な機能 (Core Features)

*   🔍 **正確な文献検索 (Deterministic Search)**
    *   **NCBI PubMed E-utilities 公式 API** と直接連携し、検索結果の絶対的な精度と再現性を確保します。
    *   **複数の対象成分**の同時検索をサポート（例：`Fenofibrate, Aspirin`）。正確な PubMed クエリ構文に自動変換されます。
    *   カスタム監視期間の設定をサポート。
*   🤖 **AI スコアリングと要約 (AI Scoring & Summarization)**
    *   任意の **OpenAI 互換 Chat Completions エンドポイント**(OpenAI、Azure OpenAI、Ollama、OpenRouter、Kimi など)と連携し、新規文献の PV 関連性スコア (0〜100) を評価します。
    *   難解な英語の医学要約を読みやすい言語に自動翻訳します。
    *   医薬品安全性監視に最も重要な **「臨床的結論 (Key Conclusion)」** を独自に抽出し、ワンクリックコピーをサポートします。
*   📊 **構造化データ抽出 (Structured Data Extraction)**
    *   対象成分、有害事象の記述 (AE Verbatim)、MedDRA 候補用語、重篤度 (Seriousness)、因果関係 (Causality) など、文献から重要な PV データを自動的に抽出します。
*   💾 **データベース管理とエクスポート (Database & Export)**
    *   確認済みの文献をインポートして保存できる「マスターデータベース」管理インターフェースを内蔵。
    *   強力な**複数フィールドのあいまい検索**と日付範囲フィルタリング機能を提供。
    *   フィルタリングされた文献データの **CSV レポートエクスポート** をワンクリックでサポートし、その後の監査とアーカイブを容易にします。

## 🆕 高度な機能 (v4)

*   📄 **CIOMS-I / E2B(R3) ドラフト生成**
    *   文献詳細ページで構造化データからワンクリックで **CIOMS-I 症例安全性報告書ドラフト** を生成し、E2B(R3) の主要データ項目対応(例:`E.i.2.1b MedDRA PT`、`G.k.2.2 Active substance`)を含みます。
    *   完全オフラインのマッピングで、コピーまたは `.txt` としてダウンロード可能です。⚠️ 出力はドラフトであり、提出前に薬事安全性担当者によるレビューと補完が必要です。
*   📈 **安全性シグナル集計 (Signal Aggregation)**
    *   「シグナル集計」タブを追加。マスターデータベースを **成分 × MedDRA PT** でグループ化して件数を集計し、重篤症例や潜在的シグナル(件数 ≥ 3 または重篤症例を含む)を示します。
*   🧬 **MedDRA 対応レイヤー**
    *   一般的な PV イベントの **PT → SOC シードディクショナリ** を内蔵し、AI が推測した PT をオフラインで検証してシステム器官分類を補完します。⚠️ 完全な MedDRA はライセンス辞書のため、自身で拡張するかライセンス済みソースに接続してください。
*   ⚡ **バッチ並列処理 + 進捗表示**
    *   AI スコアリング/要約が**並列バッチ処理**に変更され(1 ラウンドの時間を大幅短縮)、上部にリアルタイム進捗バーを表示します。
    *   マスターデータベースは未抽出の文献に対する**バッチ構造化抽出**をサポートし、シグナル集計に利用できます。
*   💽 **IndexedDB による永続化**
    *   マスターデータベースと「レビュー待ちリスト」の保存先を **IndexedDB**(localStorage よりはるかに大容量)に変更、更新してもデータが失われません。初回読み込み時に旧 localStorage から自動移行します。
*   🔎 **PubMed ページネーション**:検索時に「最大取得件数」(ページネーション上限、デフォルト 100)を設定可能。efetch は自動的にバッチ取得します。
*   🛡️ **バックエンドのレート制限**:Worker プロキシに KV 固定ウィンドウ方式のレート制限(IP ごと・1 分あたりの上限)を内蔵し、API キーのクォータを保護します。

## 🧪 テスト (Testing)

コアの純粋関数(`parseJsonLoose`、`reconcile`、MedDRA 対応、CIOMS マッピング、シグナル集計)にはすべて単体テストがあります。
```bash
npm test        # vitest でユニットテストを実行
npm run typecheck  # tsc --noEmit による型チェック
```

## 🛠️ 技術スタック (Tech Stack)

*   **フロントエンド**: React 19, TypeScript, Vite
*   **UI スタイリング**: Tailwind CSS, Heroicons
*   **AI エンジン**: 任意の OpenAI 互換 Chat Completions API(プロバイダー非依存、特定ベンダーの SDK に依存しない)
*   **データソース**: NCBI PubMed E-utilities API

## 🚀 クイックスタート (Getting Started)

### 1. 依存関係のインストール
環境に Node.js がインストールされていることを確認し、次のコマンドを実行して必要なパッケージをインストールします。
```bash
npm install
```

### 2. 環境変数の設定
`.env.example` を `.env.local` にコピーします。**ローカル開発**では、フロントエンドを任意の OpenAI 互換エンドポイントに直接向けることができます。
```env
VITE_LLM_BASE_URL=https://api.openai.com/v1
VITE_LLM_API_KEY=sk-xxxx
VITE_LLM_MODEL=gpt-4o-mini
```
> ⚠️ `VITE_` で始まる変数はフロントエンドのバンドルに含まれます——ローカル利用では問題ありませんが、**公開デプロイには適しません**。公開/複数ユーザー向けにデプロイする場合は、バックエンドプロキシを使用し(下記「デプロイ」参照)、フロントエンドには `VITE_PV_PROXY_ENDPOINT` のみを設定して、キーはサーバー側に保持してください。

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

## 🔌 LLM プロバイダー (OpenAI 互換)

AI レイヤー(`services/llmService.ts`)はプロバイダー非依存です。標準の **OpenAI Chat Completions** 形式を使用するため、OpenAI、Azure OpenAI、Ollama、OpenRouter、Kimi、LiteLLM、その他互換ゲートウェイであれば、環境変数を変更するだけで動作し、コードの変更は不要です。

プロバイダーを切り替えるには、`VITE_LLM_BASE_URL` / `VITE_LLM_MODEL`(ローカル)または Worker の `LLM_BASE_URL` / `LLM_MODEL`(プロキシ)を対象サービスに向けてください。例:

| プロバイダー | Base URL | モデル例 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `moonshotai/kimi-k2` |
| Ollama(ローカル) | `http://localhost:11434/v1` | `llama3.1` |

## 🚀 デプロイ (公開 / 複数ユーザー向け)

API キーをブラウザに一切送らないようにするため、`worker/` 内の薄いプロキシ(Cloudflare Worker)をデプロイしてください——キーはサーバー側に保持され、選択した OpenAI 互換エンドポイントにプロンプトを転送します。

```bash
cd worker
npx wrangler secret put LLM_API_KEY   # 上流のキーを secret として保存
npx wrangler secret put PROXY_TOKEN   # フロントエンドの VITE_PV_PROXY_TOKEN と同じ値にし、オープンプロキシ化を防止
npx wrangler kv namespace create RATE_LIMIT   # レート制限用の KV を作成し、返却された id を wrangler.toml に設定
npx wrangler deploy                    # LLM_BASE_URL / LLM_MODEL は wrangler.toml で設定
```
続いてフロントエンドの `VITE_PV_PROXY_ENDPOINT` をデプロイ済みの Worker URL に設定し、再ビルドします。これでフロントエンドには LLM キーが**一切含まれません**。レート制限用の KV が未バインドの場合、Worker は自動的にスキップして通常どおり動作します。

## 📄 ライセンス (License)
MIT License
