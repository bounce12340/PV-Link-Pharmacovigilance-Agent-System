[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

---

# PV-Link: ファーマコビジランス・エージェントシステム

![React](https://img.shields.io/badge/React-19-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg) ![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%7C%20D1%20%7C%20R2-orange.svg) ![OpenAI-compatible](https://img.shields.io/badge/AI-OpenAI--compatible-green.svg) ![Tests](https://img.shields.io/badge/tests-148-brightgreen.svg)

**PV-Link** は、製造販売業者における ICSR 受付の両面をカバーします。**文献モニタリング**(公表文献が自社製品について何を述べているか)と**自発報告**(営業担当者が臨床現場から聞き取った内容)です。両者は単一の症例データベース、単一の監査証跡、単一のシグナル集計ビューに集約されます。

---

## システム全体像

```
 ┌─ 文献チャネル ────────────────┐   ┌─ 自発報告チャネル ───────────────┐
 │  PubMed E-utilities           │   │  営業担当者のスマホ  #/report     │
 │       ↓                       │   │       ↓(オフラインキュー)        │
 │  AI スコアリングと要約        │   │  POST /api/ae-reports            │
 │       ↓                       │   │       ↓                          │
 │  構造化データ抽出             │   │  PV 受付コンソール(7 ゲート)     │
 └───────────┬───────────────────┘   └───────────┬──────────────────────┘
             └──────────────┬────────────────────┘
                            ↓
      マスター DB · 監査証跡 · 成分 × MedDRA PT シグナル集計
                            ↓
        CIOMS-I ドラフト · E2B(R3) マッピング · CSV エクスポート
```

すべてが単一オリジン(`pvlink.uic-ai.com`)上で、単一の Cloudflare Access 認証の背後で動作します。静的な React フロントエンドと、LLM プロキシと症例受付 API の両方を担う 1 つの Worker という構成です。

---

## 文献モニタリング

*   🔍 **決定論的検索** —— **NCBI PubMed E-utilities** 公式 API を直接利用するため、結果は正確かつ再現可能です。複数成分の同時検索(`Fenofibrate, Aspirin`)、日付範囲の指定、上限を設定できるページング取得に対応します。
*   🤖 **AI スコアリングと要約** —— 関連性スコア(0–100)、抄録の平易な要約、そして独立して抽出される**重要な結論**。並列バッチで実行され、進捗バーがリアルタイムに表示されます。
*   📊 **構造化抽出** —— 成分、有害事象の原文表現、MedDRA 候補語、重篤性、因果関係。
*   🧬 **MedDRA マッピング層** —— 一般的な PV 事象の **PT → SOC シード辞書**を内蔵し、AI が推測した PT をオフラインで検証して器官別大分類を補完します。⚠️ 完全な MedDRA 辞書はライセンスが必要です。シードを自ら拡充するか、ライセンス済みのソースを接続してください。
*   💾 **マスターデータベース** —— 複数項目のあいまい検索、日付フィルタ、CSV エクスポート、IndexedDB による永続化(初回読み込み時に localStorage から自動移行)。

## 有害事象の症例報告

報告チャネルには、対象者ごとに 2 つの画面があります。

### 📱 営業担当者向け報告画面(モバイル優先、`#/report`)

*   **CIOMS Form I** の全 26 項目に対応(項目番号を併記)。加えて、現地実務で必要となる**ロット番号、有効期限、製造販売承認番号**も収集します。
*   40 個の入力欄が並ぶ 1 ページではなく、6 ステップのウィザード形式。16px の入力欄(iOS の自動ズームを防止)、44px 以上のタッチターゲット、ネイティブのプルダウンではなくチップ型セレクタを採用しています。
*   **下書きの自動保存**(600ms デバウンス)、再接続時に自動再送する**オフラインキュー**、**端末側での写真圧縮**(長辺 1600px)。
*   バリデーションはエラーと警告に分かれます。4 要件のような決定的な欠落のみが送信をブロックし、それ以外はフォローアップ項目になります——**不完全な報告は、報告されないよりはるかに良い**からです。
*   **報告者情報の入力は一度だけ**。初回ログイン時に氏名・社員番号・電話番号・会社名(CIOMS 26／24a)を入力すれば、以降の報告は自動入力され、フォームの最初の画面は 6 つの入力欄からサマリーカードに変わります。
*   **自分の報告履歴** —— 自身が提出した症例と現在のステータスを確認できる読み取り専用の一覧。

### 🗂️ PV 受付コンソール

*   受信トレイは**法定期限の切迫度**順(期限超過 → 残日数 → 新着)で並びます。先入れ先出しではありません。
*   7 つのゲート: 受付登録 → 妥当性判定(ICSR 4 要件)→ **重複検出** → 重篤性判定(手動上書きは監査証跡に記録)→ MedDRA コーディング／予測性／因果関係 → フォローアップ → 提出と終結。
*   **法定タイマー** —— 重篤症例は初回認知日から 15 日カウントダウン。期限超過で赤、5 日以内で黄色に変わります。
*   **フォローアップ報告** —— 元の症例からワンクリックで作成(採番は `PARENT-F1`)。Day 0 は新情報を入手した日に設定されます。重要な新情報がある場合のみ 15 日タイマーが再起動し、そうでなければ新たな迅速報告期限は発生せず定期報告に収載されます。フォローアップの連鎖は重複検出の対象外です。
*   **外国症例** —— フォームで発生国(CIOMS 1a)を収集し、コンソールで標識して CIOMS と E2B `E.i.9` にマッピングします。
*   ワンクリックで **CIOMS-I テキスト様式**と **E2B(R3) 項目マッピング**を生成。症例一覧は CSV エクスポート可能。全工程に完全な**監査証跡**(誰が・いつ・何を)が残ります。
*   症例は文献レコードとともに**成分 × MedDRA PT** のシグナル集計に加わります。

> 📖 項目の根拠、規制上の注意点、バックオフィス業務フロー: [`docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md`](docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md) (繁体字中国語)

---

## アクセス制御とロール

ログインは会社のメールアドレスを用いた **Cloudflare Access Email OTP** です——漏洩・共有・再設定の対象となるパスワードが存在しません。退職時の失効も自動です。メールボックスが停止されればワンタイムコードを受け取れないため、ポリシーの整理を誰も覚えていなくてもアクセスは断たれます。

Access が答えるのは「この人は身内か」です。**何を見てよいか**は D1 で決まります。

| ロール | できること |
|---|---|
| `rep`(営業担当者) | 症例の提出、**自分が提出した症例のみ**閲覧 |
| `pv`(PV 担当者) | 全症例の読み書き |

`ae_users` に無いアドレスは `rep` として扱われます。設定漏れの結果が「全症例を見られない」(本人から申告が上がる)であって、「全症例を見られてしまう」(誰も申告しない)ではないようにするためです。最初の PV 担当者は `wrangler secret put AE_PV_EMAILS` で登録します。

> ⚠️ Access ポリシーには個別のアドレスを列挙してください。`Emails ending in @自社ドメイン` は、経理・人事・アルバイトを含む**全社員**が患者の有害事象データを読める状態を意味します。リストが長くなる場合はドメインルールに戻すのではなく Access Group を使ってください。

> ⚠️ 権限の実行点は Worker であり、画面ではありません。ハッシュルート(`#/report`)は Access のパスルールでは分離できません——`#` 以降はサーバーに送信されないためです。フロントエンドのロール判定は表示上のものにすぎず、各 API が自らロールを確認し、症例一覧の絞り込みは JS ではなく SQL 側で行い、閲覧権限のない症例には 403 ではなく 404 を返します(403 はその ID の存在を認めることになるため)。

---

## AI モデル

### 現在の構成

| | 値 | 設定場所 |
|---|---|---|
| エンドポイント | `https://ollama.com/v1`(Ollama Cloud) | `worker/wrangler.toml` の `LLM_BASE_URL` |
| モデル | `deepseek-v4-pro` | `worker/wrangler.toml` の `LLM_MODEL` |
| JSON モード | 無効 —— 上流の `response_format` 対応が一定しないため、`parseJsonLoose` で解析 | `LLM_JSON_MODE = "0"` |
| Temperature | `0.2` | `services/llmService.ts` |
| API キー | サーバー側の secret。バンドルには一切含まれません | `wrangler secret put LLM_API_KEY` |

AI 層(`services/llmService.ts`)は標準の **OpenAI Chat Completions** を話すだけで、ベンダー SDK に依存しません。したがってプロバイダーの変更は環境変数 2 つの書き換えで済み、コード変更は不要です。

| プロバイダー | Base URL | モデル例 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `moonshotai/kimi-k2` |
| Ollama(ローカル) | `http://localhost:11434/v1` | `llama3.1` |

### モデルが行うこと・行わないこと

モデルが担うのは**読解**です。関連性スコアリング、抄録の要約、重要な結論の抽出、そして自由記述からの有害事象データの構造化抽出。

**規制上の帰結を伴う判断はすべて、単体テスト付きの純粋関数であり、モデルを一切経由しません**。

*   重篤性判定と 15 日の法定タイマー
*   ICSR の 4 要件およびその他のバリデーション
*   重複検出
*   CIOMS-I および E2B(R3) マッピング
*   ロールと権限の判定

この切り分けは意図的なものです。モデルを差し替えても、あるいはモデルの調子が悪くても、変わるのは要約の品質だけです。**法定期限を動かすことも、4 要件を満たさない症例を通すことも、ある営業担当者に別の担当者の患者を見せることもできません。**

> ⚠️ AI の出力はすべて**レビュー用のドラフト**です。特に CIOMS-I は、提出前に有資格の PV 担当者による確認と補完が必須です。

---

## データの保存先

| データ | 保存先 | 備考 |
|---|---|---|
| AE 症例 | **D1**(`ae_cases`) | 症例本体は JSON ペイロード。検索・並べ替え用のインデックス列を別途展開 |
| 監査証跡 | **D1**(`ae_audit`) | 独立したテーブル。**追記のみという制約をデータベースのトリガーが強制**し、アプリケーション側の自制に依存しません |
| 添付ファイル | **R2** | 圧縮後の薬箱写真は 0.3–1.5MB。ペイロードに残すと一覧クエリのたびに引きずることになります |
| ユーザーとロール | **D1**(`ae_users`) | メールアドレス → ロール、および報告者プロフィール |
| レート制限 | **KV** | 固定ウィンドウ、IP ごと・分ごと |
| 文献マスター DB | **IndexedDB** | ブラウザ側。文献チャネルにはまだサーバーコンポーネントがありません |

> ⚠️ `VITE_AE_API_ENDPOINT` 未設定の場合、報告画面とコンソールは**同一ブラウザ**の IndexedDB を共有します。単一端末での試用のみを想定しており、本番運用にはバックエンドが必要です。

---

## 技術スタック

*   **フロントエンド** —— React 19、TypeScript 5.8、Vite 6、Tailwind CSS 3.4、Heroicons。ハッシュルーティング(静的ホスティング、サーバー側 rewrite 不要)
*   **バックエンド** —— Cloudflare Workers(LLM プロキシ + 症例受付 API)、D1(SQLite)、R2、KV
*   **認証** —— Cloudflare Access(Email OTP)。JWT は Worker がチーム JWKS に対して検証
*   **AI** —— OpenAI 互換の Chat Completions API であれば何でも可。ベンダー非依存、SDK 不使用
*   **データソース** —— NCBI PubMed E-utilities
*   **テスト** —— vitest 3 + jsdom。CI は Node 22.x と 24.x で型チェック・テスト・ビルドを実行

---

## はじめかた

```bash
npm install
cp .env.example .env.local   # 下記を参照して記入
npm run dev                  # http://localhost:3000
```

**ローカル開発**では、フロントエンドから OpenAI 互換エンドポイントに直接接続できます。

```env
VITE_LLM_BASE_URL=https://api.openai.com/v1
VITE_LLM_API_KEY=sk-xxxx
VITE_LLM_MODEL=gpt-4o-mini
```

> ⚠️ `VITE_` で始まる変数はフロントエンドのバンドルに含まれます——ローカル利用では問題ありませんが、**公開デプロイには適しません**。公開時は Worker プロキシを使い、フロントエンドには `VITE_PV_PROXY_ENDPOINT` のみを設定して、キーはサーバー側に保持してください。

### 使い方

1.  **検索設定** —— 対象成分(カンマ区切り、例: `Aspirin, Ibuprofen`)と監視期間を入力します。
2.  **タスク開始** —— PubMed に問い合わせ、マスター DB に既にある文献は自動的に除外されます。
3.  **レビュー待ち** —— AI の要約と臨床上の結論を確認し、PV 上の価値があるものを**マスター DB に取り込み**ます。
4.  **マスター DB** —— 履歴を検索し、CSV レポートをエクスポートします。
5.  **報告リンクの共有** —— 「症例受付」タブで、スマホアイコンからフォームを開き、リンクアイコンで `#/report` の URL をコピーできます(営業チームには QR コード化が有効です)。
6.  **受付処理** —— 症例は期限の切迫度順に届きます。妥当性 → 重複検出 → 重篤性 → コーディング → フォローアップ → 提出の順に処理します。
7.  **提出書類の作成** —— CIOMS-I ドラフトを生成し、レビューのうえ当局に提出、受付番号を記録して症例を終結します。

---

## デプロイ

### LLM プロキシ

```bash
cd worker
npx wrangler secret put LLM_API_KEY            # 上流のキー。サーバー側のみに保持
npx wrangler kv namespace create RATE_LIMIT    # 返却された id を wrangler.toml に設定
npx wrangler deploy                            # LLM_BASE_URL / LLM_MODEL は wrangler.toml から
```

続いて `VITE_PV_PROXY_ENDPOINT` をデプロイ済みの Worker に向けて再ビルドします。これでフロントエンドには LLM キーが**一切含まれません**。レート制限用の KV が未バインドの場合、Worker は自動的にスキップして通常どおり動作します。

### 有害事象 受付バックエンド

受付 API は**同一の** Worker 上で**同一の** Access 認証の背後に配置されるため、ログイン基盤を二重に持つ必要はありません。

```bash
cd worker
npx wrangler d1 create pv-link-ae                       # database_id を wrangler.toml に設定
npx wrangler r2 bucket create pv-link-ae-attachments
npx wrangler d1 execute pv-link-ae --remote --file=worker/schema.sql
npx wrangler secret put AE_PV_EMAILS                    # 初期 PV 担当者。カンマ区切り
npx wrangler deploy
```

続いて `VITE_AE_API_ENDPOINT=/api/ae-reports`(`.env.production` に設定済み)を指定して再ビルドします。

> 📖 詳細な手順書、ロール管理コマンド、実機テスト手順、公開前チェックリスト: [`docs/deployment-ae-backend.md`](docs/deployment-ae-backend.md) (繁体字中国語)

---

## テスト

```bash
npm test           # vitest、148 件の単体テスト
npm run typecheck  # tsc --noEmit
npm run build      # 本番ビルド
```

規制上の帰結を伴う純粋関数にはすべてテストがあります。妥当性、重篤性、法定タイマー、重複検出、CIOMS／E2B マッピング、シグナル集計、`parseJsonLoose`、`reconcile`、MedDRA マッピング、そして権限ルールです。動的な i18n キー(`ae.issue.*`、`ae.status.*`)の翻訳網羅性もテストで担保しています。

Worker はフロントエンドの TypeScript モジュールを読み込めないため、重篤性と期限の判定は意図的なミラー実装です。`tests/worker.ae.test.ts` は同一の症例群を両実装に与えて 1 件ずつ突き合わせます——ミラーがずれると法定期限の誤りとして現れ、テスト環境では再現が難しい一方、報告義務に直結するためです。

権限ルールは正常系だけでなく否定形も併せてテストしています。各テストの失敗が「ある営業担当者が別の担当者の患者データを読んだ」という事象に対応するからです。

---

## ドキュメント

| ドキュメント | 内容 |
|---|---|
| [`docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md`](docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md) | CIOMS／E2B に基づく項目の根拠、台湾の規制上の注意点、受付 7 ゲート、バックエンド構成、ロール分離、報告者プロフィール |
| [`docs/deployment-ae-backend.md`](docs/deployment-ae-backend.md) | デプロイ手順書、Access 設定、ロール管理、実機テスト手順、公開前チェックリスト |

いずれも繁体字中国語です。

## ライセンス (License)

MIT License
