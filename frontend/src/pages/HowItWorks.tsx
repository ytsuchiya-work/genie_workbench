import { useState, useEffect, useCallback } from "react"
import {
  Sparkles,
  MessageSquarePlus,
  ShieldCheck,
  Wrench,
  Zap,
  Lock,
  Layers,
  ChevronLeft,
  ChevronRight,
  Search,
  Database,
  FileText,
  Settings,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Target,
  BarChart3,
  GitBranch,
  RefreshCw,
  ArrowRightLeft,
  Gauge,
  Box,
  Globe,
  HardDrive,
  Network,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { FeatureCard } from "@/components/how-it-works/FeatureCard"
import { StageCard } from "@/components/how-it-works/StageCard"
import { PipelineDiagram } from "@/components/how-it-works/PipelineDiagram"
import type { PipelineStep } from "@/components/how-it-works/PipelineDiagram"
import { PermissionDiagram } from "@/components/how-it-works/PermissionDiagram"

const ACCENT = "#4F46E5"
const CYAN = "#06B6D4"
const SUCCESS = "#10B981"
const WARNING = "#F59E0B"
const DANGER = "#EF4444"
const INFO = "#3B82F6"

interface Stage {
  id: string
  label: string
  icon: React.ReactNode
  color: string
}

const stages: Stage[] = [
  { id: "overview", label: "概要", icon: <Sparkles className="h-4 w-4" />, color: ACCENT },
  { id: "create", label: "作成エージェント", icon: <MessageSquarePlus className="h-4 w-4" />, color: CYAN },
  { id: "score", label: "IQスキャナー", icon: <ShieldCheck className="h-4 w-4" />, color: SUCCESS },
  { id: "fix", label: "クイック修正", icon: <Wrench className="h-4 w-4" />, color: WARNING },
  { id: "optimize", label: "自動最適化", icon: <Zap className="h-4 w-4" />, color: DANGER },
  { id: "permissions", label: "権限", icon: <Lock className="h-4 w-4" />, color: INFO },
  { id: "architecture", label: "アーキテクチャ", icon: <Layers className="h-4 w-4" />, color: ACCENT },
]

export function HowItWorks() {
  const [activeStage, setActiveStage] = useState(0)

  const goNext = useCallback(() => setActiveStage((s) => Math.min(s + 1, stages.length - 1)), [])
  const goPrev = useCallback(() => setActiveStage((s) => Math.max(s - 1, 0)), [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext()
      else if (e.key === "ArrowLeft") goPrev()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [goNext, goPrev])

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <div className="relative mb-8 rounded-2xl hero-mesh overflow-hidden border border-default">
        <div className="absolute inset-0 hero-grid pointer-events-none" />
        <div className="relative px-8 py-10 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 border border-accent/20 px-4 py-1.5 text-xs font-semibold text-accent mb-4">
            <Sparkles className="h-3.5 w-3.5" /> インタラクティブガイド
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-primary mb-3">
            <span className="text-gradient">Genie Workbench</span> の仕組み
          </h1>
          <p className="text-secondary text-base max-w-2xl mx-auto leading-relaxed">
            Genie スペースの作成、スコアリング、修正、最適化を一つのインターフェースから実行。各機能を以下で確認できます。
          </p>
        </div>
      </div>

      {/* Stage navigation pills */}
      <div className="mb-8 flex flex-wrap justify-center gap-1.5">
        {stages.map((stage, i) => (
          <button
            key={stage.id}
            onClick={() => setActiveStage(i)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-all duration-200",
              i === activeStage
                ? "shadow-md scale-105"
                : "bg-elevated text-muted hover:text-secondary hover:bg-surface border border-default",
            )}
            style={
              i === activeStage
                ? { background: `${stage.color}18`, color: stage.color, boxShadow: `0 4px 12px ${stage.color}25` }
                : undefined
            }
          >
            {stage.icon}
            <span className="hidden sm:inline">{stage.label}</span>
          </button>
        ))}
      </div>

      {/* Stage content */}
      <div key={stages[activeStage].id} className="animate-slide-up">
        {activeStage === 0 && <OverviewContent />}
        {activeStage === 1 && <CreateAgentContent />}
        {activeStage === 2 && <IQScannerContent />}
        {activeStage === 3 && <FixAgentContent />}
        {activeStage === 4 && <AutoOptimizeContent />}
        {activeStage === 5 && <PermissionsContent />}
        {activeStage === 6 && <ArchitectureContent />}
      </div>

      {/* Prev / Next navigation */}
      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={goPrev}
          disabled={activeStage === 0}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            activeStage === 0
              ? "text-muted/40 cursor-not-allowed"
              : "text-secondary hover:text-primary hover:bg-elevated",
          )}
        >
          <ChevronLeft className="h-4 w-4" /> {activeStage > 0 ? stages[activeStage - 1].label : "Back"}
        </button>

        <span className="text-xs text-muted">
          {activeStage + 1} / {stages.length} &middot; 矢印キーで移動
        </span>

        <button
          onClick={activeStage === stages.length - 1 ? () => setActiveStage(0) : goNext}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors text-secondary hover:text-primary hover:bg-elevated"
        >
          {activeStage < stages.length - 1 ? stages[activeStage + 1].label : "概要に戻る"} <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/* ================================================================
   STAGE 0 — Overview
   ================================================================ */
function OverviewContent() {
  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <h2 className="text-xl font-display font-bold text-primary">Genie スペースに必要なすべて</h2>
        <p className="text-sm text-muted mt-1">4つの強力な機能、1つの効率的なワークフロー</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-stagger">
        <FeatureCard
          icon={<MessageSquarePlus className="h-6 w-6" />}
          title="作成"
          description="自然言語で必要な内容を記述。AIエージェントがデータを検出し、計画を作成し、完全に構成されたGenie スペースを作成します。"
          accentColor={CYAN}
          glowColor={`${CYAN}15`}
        />
        <FeatureCard
          icon={<ShieldCheck className="h-6 w-6" />}
          title="スコア"
          description="12の品質チェックでGenie スペースを即座にスキャン。成熟度ティア（未準備→準備完了→信頼済）とアクション可能な指摘を取得。"
          accentColor={SUCCESS}
          glowColor={`${SUCCESS}15`}
        />
        <FeatureCard
          icon={<Wrench className="h-6 w-6" />}
          title="クイック修正"
          description="スキャン結果を設定レベルの修正に変換。JSONパッチを生成し直接適用。一括説明にはUnity CatalogのAI生成を使用。"
          accentColor={WARNING}
          glowColor={`${WARNING}15`}
        />
        <FeatureCard
          icon={<Zap className="h-6 w-6" />}
          title="最適化"
          description="ベンチマーク駆動の最適化パイプラインを実行。実際の質問をテストし、9つの評価基準で評価し、改善を自動適用。"
          accentColor={DANGER}
          glowColor={`${DANGER}15`}
        />
      </div>

      {/* End-to-end flow */}
      <StageCard title="エンドツーエンドワークフロー" icon={<ArrowRightLeft className="h-4 w-4" />}>
        <PipelineDiagram
          steps={[
            { icon: <MessageSquarePlus className="h-5 w-5" />, label: "作成", description: "AIがスペースを構築", color: CYAN },
            { icon: <ShieldCheck className="h-5 w-5" />, label: "スコア", description: "12項目品質スキャン", color: SUCCESS },
            { icon: <Wrench className="h-5 w-5" />, label: "クイック修正", description: "パッチを自動適用", color: WARNING },
            { icon: <Zap className="h-5 w-5" />, label: "最適化", description: "ベンチマーク＆改善", color: DANGER },
            { icon: <CheckCircle2 className="h-5 w-5" />, label: "信頼済", description: "本番環境対応", color: SUCCESS },
          ]}
        />
      </StageCard>
    </div>
  )
}

/* ================================================================
   STAGE 1 — Create Agent
   ================================================================ */
function CreateAgentContent() {
  const agentSteps: PipelineStep[] = [
    { icon: <FileText className="h-5 w-5" />, label: "要件", description: "目標を説明", color: CYAN },
    { icon: <Database className="h-5 w-5" />, label: "データソース", description: "カタログとテーブルを選択", color: INFO },
    { icon: <Search className="h-5 w-5" />, label: "検査", description: "AIがスキーマを読取", color: ACCENT },
    { icon: <GitBranch className="h-5 w-5" />, label: "計画", description: "並列計画生成", color: SUCCESS },
    { icon: <Settings className="h-5 w-5" />, label: "設定", description: "Genie スペースを構築", color: WARNING },
    { icon: <CheckCircle2 className="h-5 w-5" />, label: "完了", description: "スコア準備完了", color: SUCCESS },
  ]

  const tools = [
    { name: "list_catalogs", desc: "利用可能なUnity Catalogカタログを参照" },
    { name: "list_schemas", desc: "選択したカタログ内のスキーマを一覧表示" },
    { name: "list_tables", desc: "テーブルとその説明を検出" },
    { name: "get_table_schema", desc: "カラム名、型、コメントを読取" },
    { name: "run_sql", desc: "テーブル内容を確認するためサンプルデータを取得" },
    { name: "create_genie_space", desc: "最終スペースを構築・設定" },
  ]

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <h2 className="text-xl font-display font-bold text-primary">作成エージェント</h2>
        <p className="text-sm text-muted mt-1">マルチターンAI会話でGenie スペースをステップバイステップで構築</p>
      </div>

      <StageCard title="6ステップの進行" subtitle="エージェントが各フェーズをガイド" icon={<MessageSquarePlus className="h-4 w-4" />}>
        <PipelineDiagram steps={agentSteps} />
      </StageCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StageCard title="エージェントツール" subtitle="AIができること" icon={<Settings className="h-4 w-4" />}>
          <div className="space-y-2.5">
            {tools.map((t) => (
              <div key={t.name} className="flex items-start gap-3">
                <code className="text-xs font-mono bg-accent/10 text-accent px-2 py-0.5 rounded shrink-0 mt-0.5">{t.name}</code>
                <span className="text-sm text-secondary">{t.desc}</span>
              </div>
            ))}
          </div>
        </StageCard>

        <StageCard title="ユーザー体験" subtitle="操作イメージ" icon={<Sparkles className="h-4 w-4" />}>
          <div className="space-y-4">
            <div className="rounded-lg bg-elevated border border-default p-4">
              <p className="text-sm text-secondary italic">「小売分析用のGenie スペースが必要です。commerceカタログに売上トランザクションと在庫テーブルがあります。」</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                <div className="h-5 w-5 rounded-full bg-accent/20 flex items-center justify-center">
                  <MessageSquarePlus className="h-3 w-3 text-accent" />
                </div>
                エージェントがテーブルを検出し、スキーマを読み取り、計画を提案...
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-secondary">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                リアルタイムストリーミング — エージェントの思考と行動を確認
              </div>
              <div className="flex items-center gap-2 text-secondary">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                高速な並列計画生成
              </div>
              <div className="flex items-center gap-2 text-secondary">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                セッション永続化 — 中断した場所から再開
              </div>
            </div>
          </div>
        </StageCard>
      </div>
    </div>
  )
}

/* ================================================================
   STAGE 2 — IQ Scanner
   ================================================================ */
function IQScannerContent() {
  const configChecks = [
    { name: "データソースの存在", desc: "スペースに1つ以上のテーブルまたはメトリックビューが接続" },
    { name: "テーブル説明（≥80%）", desc: "テーブルの80%以上に意味のある説明がある" },
    { name: "カラム説明（≥50%）", desc: "カラムの50%以上が文書化されている" },
    { name: "テキスト指示（>50文字）", desc: "ビジネスコンテキストと用語が説明されている" },
    { name: "結合仕様", desc: "複数ソーススペースの結合パスが定義されている" },
    { name: "データソース数 1-12", desc: "精度に最適なテーブルとメトリックビューの数" },
    { name: "8+個のSQLクエリ例", desc: "モデルが学習する多様なクエリパターン" },
    { name: "SQLスニペット", desc: "関数、式、メジャー、フィルターが定義されている" },
    { name: "エンティティ/フォーマット一致", desc: "カテゴリカルカラムと日付/数値カラムが注釈されている" },
    { name: "10+個のベンチマーク質問", desc: "精度を測定するための正解付き質問" },
  ]

  const optimizationChecks = [
    { name: "最適化ワークフロー完了", desc: "スペースが最適化パイプラインを完了している" },
    { name: "最適化精度 ≥ 85%", desc: "ベンチマーク精度が信頼済みしきい値を満たす" },
  ]

  const tiers = [
    { name: "未準備", criteria: "設定の不足あり", color: DANGER, icon: <XCircle className="h-5 w-5" />, desc: "10項目の設定チェックで1つ以上不合格" },
    { name: "最適化準備完了", criteria: "全設定チェック合格", color: INFO, icon: <AlertTriangle className="h-5 w-5" />, desc: "全10項目の設定チェック合格 — 最適化待ち" },
    { name: "信頼済", criteria: "全12チェック合格", color: SUCCESS, icon: <CheckCircle2 className="h-5 w-5" />, desc: "設定＋最適化チェック全合格" },
  ]

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <h2 className="text-xl font-display font-bold text-primary">IQスキャナー</h2>
        <p className="text-sm text-muted mt-1">ルールベースの即時品質スコアリング — LLM不要</p>
      </div>

      {/* Maturity tiers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-stagger">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className="rounded-xl border-2 p-5 text-center transition-shadow hover:shadow-lg"
            style={{ borderColor: `${tier.color}40`, background: `${tier.color}08` }}
          >
            <div className="flex justify-center mb-3">
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center"
                style={{ background: `${tier.color}20`, color: tier.color }}
              >
                {tier.icon}
              </div>
            </div>
            <h3 className="font-display font-bold text-primary text-base">{tier.name}</h3>
            <div className="text-sm font-semibold mt-1" style={{ color: tier.color }}>{tier.criteria}</div>
            <p className="text-xs text-muted mt-1.5">{tier.desc}</p>
          </div>
        ))}
      </div>

      {/* Score gauge illustration */}
      <StageCard title="12の品質チェック" subtitle="各チェック1ポイント" icon={<Gauge className="h-4 w-4" />}>
        <div className="mb-3">
          <h4 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">設定チェック（1-10）</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {configChecks.map((check) => (
              <div key={check.name} className="flex items-start gap-2.5 py-1.5">
                <div className="h-2 w-2 rounded-full shrink-0 mt-1.5" style={{ background: ACCENT }} />
                <div>
                  <span className="text-sm text-primary font-medium block">{check.name}</span>
                  <span className="text-xs text-muted">{check.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="pt-3 border-t border-default">
          <h4 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">最適化チェック（11-12）</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {optimizationChecks.map((check) => (
              <div key={check.name} className="flex items-start gap-2.5 py-1.5">
                <div className="h-2 w-2 rounded-full shrink-0 mt-1.5" style={{ background: SUCCESS }} />
                <div>
                  <span className="text-sm text-primary font-medium block">{check.name}</span>
                  <span className="text-xs text-muted">{check.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </StageCard>
    </div>
  )
}

/* ================================================================
   STAGE 3 — Fix Agent
   ================================================================ */
function FixAgentContent() {
  const fixSteps: PipelineStep[] = [
    { icon: <ShieldCheck className="h-5 w-5" />, label: "スキャン結果", description: "IQスキャナーからの指摘", color: SUCCESS },
    { icon: <Search className="h-5 w-5" />, label: "分析", description: "LLMが各指摘を確認", color: INFO },
    { icon: <FileText className="h-5 w-5" />, label: "パッチ生成", description: "指摘ごとのJSONパッチ", color: WARNING },
    { icon: <Target className="h-5 w-5" />, label: "検証", description: "パッチの安全性確認", color: ACCENT },
    { icon: <CheckCircle2 className="h-5 w-5" />, label: "適用", description: "Genie APIに書込", color: SUCCESS },
  ]

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <h2 className="text-xl font-display font-bold text-primary">クイック修正</h2>
        <p className="text-sm text-muted mt-1">IQスキャナーの指摘から設定レベルの修正を自動生成・適用</p>
      </div>

      <StageCard title="スキャン→修正パイプライン" icon={<Wrench className="h-4 w-4" />}>
        <PipelineDiagram steps={fixSteps} />
      </StageCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StageCard title="修正対象" icon={<Target className="h-4 w-4" />}>
          <div className="space-y-3">
            {[
              { label: "不足している指示", fix: "テーブルメタデータからコンテキストに合った指示を生成" },
              { label: "不足しているサンプル質問", fix: "ユーザーが実際に尋ねるリアルな質問を作成" },
              { label: "空のテーブル説明", fix: "カラム分析から説明を作成" },
              { label: "不足しているカラム説明", fix: "名前、型、サンプルに基づきカラムを文書化" },
              { label: "不明確な命名", fix: "より明確な表示名を提案" },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-3">
                <div className="mt-1 h-5 w-5 rounded bg-warning/10 flex items-center justify-center shrink-0">
                  <Wrench className="h-3 w-3 text-warning" />
                </div>
                <div>
                  <span className="text-sm font-medium text-primary">{item.label}</span>
                  <p className="text-xs text-muted">{item.fix}</p>
                </div>
              </div>
            ))}
          </div>
        </StageCard>

        <StageCard title="パッチ形式" subtitle="JSON Patch (RFC 6902)" icon={<FileText className="h-4 w-4" />}>
          <div className="rounded-lg bg-sunken border border-default p-4 font-mono text-xs leading-relaxed">
            <div className="text-muted">{"// Example: adding a table description"}</div>
            <div className="mt-2">
              <span className="text-accent">{"{"}</span><br />
              <span className="ml-3 text-cyan">"op"</span>: <span className="text-success">"replace"</span>,<br />
              <span className="ml-3 text-cyan">"path"</span>: <span className="text-success">"/tables/0/description"</span>,<br />
              <span className="ml-3 text-cyan">"value"</span>: <span className="text-success">"Daily sales transactions..."</span><br />
              <span className="text-accent">{"}"}</span>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center gap-2 text-secondary">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
              高速化のためパッチを並列実行
            </div>
            <div className="flex items-center gap-2 text-secondary">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
              IDサニタイズにより対象エラーを防止
            </div>
            <div className="flex items-center gap-2 text-secondary">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
              Genie Space API経由で適用 — ファイル編集不要
            </div>
          </div>
        </StageCard>
      </div>

      <StageCard title="制限事項" subtitle="クイック修正でできないこと" icon={<AlertTriangle className="h-4 w-4" />}>
        <div className="space-y-2.5 text-sm">
          {[
            "カラム説明は1回あたり50件まで — 一括カバレッジにはUnity CatalogのAI生成を使用",
            "データアクセスなし — 説明はカラム名のみから推定、実際の値は参照しない",
            "生成されたSQLクエリ例はテストされていない — 適用後にGenie スペースで確認",
            "テーブルの追加・削除は不可 — Unity Catalogでデータソースを管理",
            "最適化チェック（11-12）には最適化パイプラインの実行が必要",
          ].map((item) => (
            <div key={item} className="flex items-start gap-2.5">
              <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <span className="text-secondary">{item}</span>
            </div>
          ))}
        </div>
      </StageCard>
    </div>
  )
}

/* ================================================================
   STAGE 4 — Auto-Optimize (GSO)
   ================================================================ */
function AutoOptimizeContent() {
  const pipelineSteps: PipelineStep[] = [
    { icon: <ShieldCheck className="h-5 w-5" />, label: "事前チェック", description: "スペース準備状況を検証", color: INFO },
    { icon: <BarChart3 className="h-5 w-5" />, label: "ベースライン", description: "ベンチマーク質問を実行", color: ACCENT },
    { icon: <Database className="h-5 w-5" />, label: "エンリッチ", description: "メタデータコンテキストを収集", color: CYAN },
    { icon: <RefreshCw className="h-5 w-5" />, label: "レバーループ", description: "レバーを適用・評価", color: WARNING },
    { icon: <Target className="h-5 w-5" />, label: "最終決定", description: "最適な組合せを選択", color: SUCCESS },
    { icon: <CheckCircle2 className="h-5 w-5" />, label: "デプロイ", description: "最良の設定を適用", color: SUCCESS },
  ]

  const levers = [
    { name: "指示", desc: "スペースレベルの指示を書き換え・強化", color: ACCENT },
    { name: "テーブル説明", desc: "モデルへのテーブル説明を改善", color: CYAN },
    { name: "カラム説明", desc: "カラムレベルのドキュメントを追加・改善", color: SUCCESS },
    { name: "サンプル質問", desc: "より良いクエリ例を生成", color: WARNING },
    { name: "認定クエリ", desc: "よくある質問に対する検証済みSQLを追加", color: DANGER },
  ]

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <h2 className="text-xl font-display font-bold text-primary">自動最適化 (GSO)</h2>
        <p className="text-sm text-muted mt-1">ベンチマーク駆動の最適化 — 実際の質問をテストし、効果のあるものを選択</p>
      </div>

      <StageCard title="6タスクパイプライン" icon={<Zap className="h-4 w-4" />}>
        <PipelineDiagram steps={pipelineSteps} />
      </StageCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StageCard title="5つのレバーカテゴリ" subtitle="チューニング対象" icon={<Settings className="h-4 w-4" />}>
          <div className="space-y-3">
            {levers.map((l) => (
              <div key={l.name} className="flex items-center gap-3">
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${l.color}15` }}
                >
                  <div className="h-3 w-3 rounded-sm" style={{ background: l.color }} />
                </div>
                <div>
                  <span className="text-sm font-medium text-primary">{l.name}</span>
                  <p className="text-xs text-muted">{l.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </StageCard>

        <StageCard title="3ゲート評価" subtitle="品質の測定方法" icon={<BarChart3 className="h-4 w-4" />}>
          <div className="space-y-4">
            {[
              { gate: "ゲート1 — SQL妥当性", desc: "生成されたSQLはパース・実行できるか？", color: INFO },
              { gate: "ゲート2 — スキーマ一致", desc: "カラムとテーブルは期待される出力と一致するか？", color: WARNING },
              { gate: "ゲート3 — 意味的正確性", desc: "結果は正解データと一致するか？（9つの評価基準）", color: SUCCESS },
            ].map((g) => (
              <div key={g.gate} className="rounded-lg border p-3" style={{ borderColor: `${g.color}30`, background: `${g.color}05` }}>
                <h4 className="text-sm font-semibold" style={{ color: g.color }}>{g.gate}</h4>
                <p className="text-xs text-muted mt-0.5">{g.desc}</p>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-2 text-xs text-muted border-t border-default">
              <RefreshCw className="h-3.5 w-3.5" />
              精度が収束するか最大ラウンドに達するまで繰り返し
            </div>
          </div>
        </StageCard>
      </div>
    </div>
  )
}

/* ================================================================
   STAGE 5 — Permissions
   ================================================================ */
function PermissionsContent() {
  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <h2 className="text-xl font-display font-bold text-primary">権限モデル</h2>
        <p className="text-sm text-muted mt-1">デュアルIDアーキテクチャ — インタラクティブ作業にはユーザートークン、バックグラウンドジョブにはアプリIDを使用</p>
      </div>
      <PermissionDiagram />
    </div>
  )
}

/* ================================================================
   STAGE 6 — Architecture
   ================================================================ */
function ArchitectureContent() {
  const layers = [
    {
      name: "フロントエンド",
      desc: "React 19 + TypeScript + Tailwind CSS v4",
      color: CYAN,
      icon: <Globe className="h-5 w-5" />,
      items: ["FastAPIが配信するシングルページアプリ", "リアルタイム更新用SSEストリーミング", "CSS変数によるダーク/ライトテーマ"],
    },
    {
      name: "バックエンド",
      desc: "FastAPI + Pydantic + asyncio",
      color: ACCENT,
      icon: <Box className="h-5 w-5" />,
      items: ["4つのルーター: analysis, spaces, admin, create", "OBOミドルウェア（ContextVarベース）", "Databricksサービングエンドポイント経由のLLM呼び出し"],
    },
    {
      name: "永続化",
      desc: "Lakebase (PostgreSQL) + Deltaテーブル",
      color: SUCCESS,
      icon: <HardDrive className="h-5 w-5" />,
      items: ["Lakebaseにスキャン、お気に入り、セッションを保存", "12のDeltaテーブルに最適化状態を保存", "インメモリストレージへのグレースフルフォールバック"],
    },
    {
      name: "連携",
      desc: "Databricksプラットフォームサービス",
      color: WARNING,
      icon: <Network className="h-5 w-5" />,
      items: ["データ検出用Unity Catalog", "スペース管理用Genie API", "最適化パイプライン用Lakeflow Jobs"],
    },
  ]

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <h2 className="text-xl font-display font-bold text-primary">アーキテクチャ</h2>
        <p className="text-sm text-muted mt-1">フルスタックDatabricksアプリ — Reactフロントエンド、FastAPIバックエンド、プラットフォーム連携</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-stagger">
        {layers.map((layer) => (
          <div
            key={layer.name}
            className="rounded-xl border-2 p-5 transition-shadow hover:shadow-lg"
            style={{ borderColor: `${layer.color}30`, background: `${layer.color}05` }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center"
                style={{ background: `${layer.color}20`, color: layer.color }}
              >
                {layer.icon}
              </div>
              <div>
                <h3 className="font-display font-bold text-primary text-sm">{layer.name}</h3>
                <p className="text-xs text-muted">{layer.desc}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {layer.items.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-secondary">
                  <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: layer.color }} />
                  {item}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Data flow diagram */}
      <StageCard title="データフロー" subtitle="リクエストのシステム内フロー" icon={<ArrowRightLeft className="h-4 w-4" />}>
        <PipelineDiagram
          steps={[
            { icon: <Globe className="h-5 w-5" />, label: "ブラウザ", description: "React SPA", color: CYAN },
            { icon: <Box className="h-5 w-5" />, label: "FastAPI", description: "OBOミドルウェア", color: ACCENT },
            { icon: <Database className="h-5 w-5" />, label: "Genie API", description: "スペースCRUD", color: INFO },
            { icon: <HardDrive className="h-5 w-5" />, label: "Lakebase", description: "状態保存", color: SUCCESS },
            { icon: <Network className="h-5 w-5" />, label: "Unity Catalog", description: "データガバナンス", color: WARNING },
          ]}
        />
      </StageCard>
    </div>
  )
}
