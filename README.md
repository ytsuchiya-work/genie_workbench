# Genie Workbench

Databricks Genie Space の管理・分析・最適化を行う統合プラットフォーム。LLM を活用した自動分析（GenieRx）と組織横断のスコアリング（GenieIQ）を提供します。

**デモ環境:** https://genie-workbench-7474645908464260.aws.databricksapps.com/

---

## 概要

Genie Workbench は以下の機能を1つの Databricks App に統合しています:

| 機能 | 説明 |
|------|------|
| **GenieRx** | Genie Space の設定を LLM で深層分析し、最適化提案・自動修正を実行 |
| **GenieIQ** | 組織内の全 Genie Space を横断スキャンし、IQ スコアで品質を定量化 |
| **Create Wizard** | Unity Catalog を探索し、対話的に新規 Genie Space を作成 |
| **Auto-Optimize (GSO)** | ベンチマーク評価ベースで反復的に精度を自動改善 |
| **Admin Dashboard** | 組織全体の統計・リーダーボード・アラートを表示 |

### Genie 精度改善フロー

Genie Workbench では、以下のステップを組み合わせて Genie Space の回答精度を段階的に高めていきます:

```
┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────────┐
│  1. 可視化  │────►│  2. 診断   │────►│  3. 修正   │────►│  4. 自動最適化  │
│  (GenieIQ) │     │ (GenieRx)  │     │ (Fix Agent)│     │    (GSO)       │
└────────────┘     └────────────┘     └────────────┘     └────────────────┘
       │                                                          │
       └──────────────────── 5. 継続モニタリング ◄─────────────────┘
```

**Step 1 — 可視化 (GenieIQ スキャン)**
組織内の全 Genie Space を横断スキャンし、IQ スコア (0〜100) を算出します。スコアは Instructions の充実度、Column Config の設定率、Sample Questions の有無など複数の観点から評価され、「どの Space が改善を必要としているか」を一目で把握できます。

**Step 2 — 診断 (GenieRx 分析)**
改善が必要な Space を選択し、LLM による深層分析を実行します。テーブル定義・カラム説明・Instructions・Join Spec 等の設定を読み取り、「何が不足しているか」「どこに曖昧さがあるか」を具体的な Findings（改善ポイント）として一覧化します。

**Step 3 — 修正 (Fix Agent)**
検出された Findings に対し、AI Fix Agent が修正パッチを自動生成します。差分プレビューで変更内容を確認した上で、ワンクリックで Genie Space に適用できます。これにより、Instructions の追加・Column 説明の補完・Sample SQL の追加などが即座に反映されます。

**Step 4 — 自動最適化 (GSO: Genie Space Optimizer)**
さらに高い精度を目指す場合は、Auto-Optimize を起動します。GSO はベンチマーク質問セットに対して Genie の回答を自動評価し、以下のレバーを反復的に操作して精度を改善します:

| レバー | 操作内容 |
|--------|----------|
| Proactive Enrichment | UC メタデータから説明文を自動補完 |
| Tables & Columns | カラム説明・同義語・除外設定の最適化 |
| Metric Views | メトリクスビュー定義の改善 |
| SQL Queries & Functions | Example SQL・SQL 関数の追加 |
| Join Specifications | テーブル間結合条件の明確化 |
| Text Instructions | 自然言語 Instructions の追加・改善 |

各イテレーションで精度が向上すれば変更を保持し、しなければロールバック。収束条件を満たすまで自動で繰り返します。

**Step 5 — 継続モニタリング**
最適化後も GenieIQ スコアの推移を Admin Dashboard で追跡し、スコアが低下した Space には再スキャン・再最適化を実施します。このサイクルを回すことで、組織全体の Genie 品質を継続的に維持・向上させます。

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│                   Databricks Apps                        │
│                                                         │
│  ┌───────────────┐         ┌──────────────────────┐    │
│  │   Frontend    │  REST   │      Backend         │    │
│  │  React/Vite   │◄───────►│  FastAPI (uvicorn)   │    │
│  │  TailwindCSS  │         │                      │    │
│  └───────────────┘         │  ┌────────────────┐  │    │
│                            │  │ Analysis Router│  │    │
│                            │  │ Spaces Router  │  │    │
│                            │  │ Admin Router   │  │    │
│                            │  │ Create Router  │  │    │
│                            │  │ AutoOpt Router │  │    │
│                            │  └───────┬────────┘  │    │
│                            └──────────┼───────────┘    │
└───────────────────────────────────────┼────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                    │
          ┌─────────▼──────┐  ┌────────▼───────┐  ┌───────▼────────┐
          │  Genie Space   │  │  Model Serving │  │   Lakebase     │
          │  API           │  │  (Claude etc.) │  │  (PostgreSQL)  │
          └────────────────┘  └────────────────┘  └────────────────┘
                    │                                       │
          ┌────────▼────────┐                    ┌─────────▼────────┐
          │  Unity Catalog  │                    │  MLflow Tracing  │
          │  (Tables/Views) │                    │  (Observability) │
          └─────────────────┘                    └──────────────────┘
```

### 技術スタック

| レイヤー | テクノロジー |
|----------|-------------|
| Frontend | React 19, Vite 7, TailwindCSS 4, TypeScript, Recharts |
| Backend | Python 3.11+, FastAPI, uvicorn, Pydantic |
| LLM | Databricks Model Serving (Claude Sonnet 4.6) |
| データ永続化 | Lakebase (PostgreSQL via asyncpg) |
| 観測性 | MLflow Tracing |
| パッケージ管理 | uv (Python), npm (Frontend) |
| 認証 | OBO (On-Behalf-Of) ユーザートークン |

---

## ディレクトリ構成

```
genie-workbench/
├── app.yaml                    # Databricks App 設定 (コマンド, 環境変数, リソース)
├── pyproject.toml              # Python プロジェクト設定 & 依存関係
├── package.json                # ルート npm 設定
├── uv.lock                     # Python 依存のロックファイル
├── backend/
│   ├── main.py                 # FastAPI アプリケーションエントリポイント
│   ├── models.py               # Pydantic データモデル
│   ├── routers/                # API ルーター
│   │   ├── analysis.py         # Genie Space 取得・分析
│   │   ├── spaces.py           # Space 一覧・IQ スキャン
│   │   ├── admin.py            # 管理ダッシュボード
│   │   ├── create.py           # Space 作成ウィザード
│   │   └── auto_optimize.py    # GSO 自動最適化プロキシ
│   ├── services/               # ビジネスロジック
│   │   ├── genie_client.py     # Genie API クライアント
│   │   ├── fix_agent.py        # LLM Fix Agent
│   │   ├── scanner.py          # IQ スコアリング
│   │   ├── lakebase.py         # PostgreSQL 永続化
│   │   ├── llm_utils.py        # LLM 呼び出しユーティリティ
│   │   ├── uc_client.py        # Unity Catalog 操作
│   │   └── create_agent*.py    # Space 作成 AI エージェント
│   └── prompts*/               # LLM プロンプトテンプレート
├── frontend/
│   ├── src/
│   │   ├── App.tsx             # ルートコンポーネント (5画面: List, Detail, Admin, Create, HowItWorks)
│   │   ├── pages/              # 画面コンポーネント
│   │   ├── components/         # 共通 UI コンポーネント
│   │   ├── hooks/              # カスタムフック
│   │   └── lib/                # ユーティリティ・API クライアント
│   └── package.json            # Frontend 依存関係
└── packages/
    └── genie-space-optimizer/  # GSO エンジン (ワークスペース内パッケージ)
        ├── src/genie_space_optimizer/
        │   ├── backend/        # 最適化ジョブロジック
        │   ├── common/         # 共通ユーティリティ
        │   ├── optimization/   # 反復最適化エンジン
        │   ├── iq_scan/        # IQ スコアリングロジック
        │   └── ui/             # GSO 専用 UI
        └── pyproject.toml
```

---

## デモの使い方

### 前提条件

- Databricks ワークスペースへのアクセス
- 1つ以上の Genie Space が作成済み
- SQL Warehouse が利用可能

### 画面の操作フロー

#### 1. Space 一覧 (トップ画面)

アプリにアクセスすると、組織内の Genie Space が一覧表示されます。各 Space には IQ スコア (0-100) が表示され、品質を一目で把握できます。

#### 2. Space 詳細 & 分析 (GenieRx)

Space をクリックすると詳細画面に遷移し、以下の操作が可能です:

- **Scan**: Space の設定を LLM で分析し、改善ポイントを特定
- **Fix**: 検出された問題を AI が自動修正（差分プレビュー付き）
- **Auto-Optimize**: ベンチマーク評価を用いた反復的な精度改善を開始

#### 3. Space 作成 (Create Wizard)

ナビゲーションの「Create」から新規 Space を AI アシスタント付きで作成:

1. Unity Catalog のカタログ・スキーマ・テーブルを探索
2. 対象テーブルを選択
3. AI がテーブル構造を分析し、最適な設定（Instructions、Sample Questions 等）を自動生成
4. プレビュー確認後にワンクリックでデプロイ

#### 4. Admin Dashboard

組織全体の Genie Space 品質サマリー、スコアランキング、アラートを確認できます。

#### 5. Auto-Optimize (GSO)

Genie Space Optimizer は以下のサイクルで精度を改善します:

1. ベンチマーク質問に対する Genie の回答を評価
2. 精度スコアを算出
3. LLM が改善レバー（Instructions 追加、Column Config 修正 等）を選択
4. 変更を適用して再評価
5. 精度が向上した場合は変更を保持、しなければロールバック
6. 収束するまで繰り返し

---

## ローカル開発

### セットアップ

```bash
# Python 依存のインストール
uv sync

# Frontend 依存のインストール & ビルド
cd frontend && npm ci && npm run build && cd ..

# 環境変数の設定
cp .env.example .env.local  # 必要に応じて編集
```

### 起動

```bash
# Backend (ホットリロード付き)
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (開発サーバー)
cd frontend && npm run dev
```

ローカル実行時は `DEV_USER_EMAIL` を `.env.local` に設定すると、OBO 認証なしで動作確認できます。

### デプロイ

```bash
# Databricks Apps へデプロイ
databricks apps deploy genie-workbench --source-code-path .
```

---

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `LLM_MODEL` | LLM モデルエンドポイント名 | `databricks-claude-sonnet-4-6` |
| `SQL_WAREHOUSE_ID` | SQL Warehouse ID (リソースから注入) | — |
| `LAKEBASE_HOST` | Lakebase PostgreSQL ホスト | — |
| `MLFLOW_EXPERIMENT_ID` | MLflow 実験 ID (トレーシング用) | — |
| `GSO_JOB_ID` | GSO 最適化ジョブ ID | — |
| `GENIE_TARGET_DIRECTORY` | 新規 Space 作成先ディレクトリ | `/Shared/` |
| `DEV_USER_EMAIL` | ローカル開発用ユーザーメール | — |

---

## 認証

本アプリは **OBO (On-Behalf-Of)** 認証を使用します。Databricks Apps プラットフォームがユーザーの OAuth トークンを `x-forwarded-access-token` ヘッダーで転送し、ユーザーの権限でのみ Genie Space にアクセスします。これにより、ユーザーが閲覧・管理権限を持つ Space のみが操作対象になります。

---

## ライセンス

このリポジトリの `LICENSE` ファイルを参照してください。
