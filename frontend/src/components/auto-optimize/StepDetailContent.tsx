import { ExternalLink } from "lucide-react"
import type { GSOPipelineStep } from "@/types"

interface StepDetailContentProps {
  step: GSOPipelineStep
}

function StatBadge({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-default bg-elevated/50 px-2.5 py-0.5 text-xs font-medium text-primary">
      {label}: {value}
    </span>
  )
}

function JudgeScoreBadge({ name, score }: { name: string; score: number | null }) {
  if (score == null) return null
  const pct = score > 1 ? score : score * 100
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-default bg-elevated/50 px-2.5 py-0.5 text-xs font-medium text-primary">
      {name.replace(/_/g, "_")}: {pct.toFixed(1)}%
    </span>
  )
}

function PreflightContent({ outputs }: { outputs: Record<string, any> }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <StatBadge label="テーブル" value={outputs.tableCount} />
        <StatBadge label="関数" value={outputs.functionCount} />
        <StatBadge label="指示" value={outputs.instructionCount} />
        <StatBadge label="サンプル質問" value={outputs.sampleQuestionCount} />
        <StatBadge label="カラム" value={outputs.columnsCollected} />
        <StatBadge label="タグ" value={outputs.tagsCollected} />
      </div>
      {outputs.columnSamples?.length > 0 && (
        <p className="text-xs text-muted">
          サンプルカラム: {outputs.columnSamples.join(", ")}
        </p>
      )}
    </div>
  )
}

function BaselineContent({ outputs }: { outputs: Record<string, any> }) {
  const judgeScores = outputs.judgeScores as Record<string, number | null> | undefined
  const sampleQuestions = outputs.sampleQuestions as Array<Record<string, any>> | undefined

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <StatBadge label="無効なベンチマーク" value={outputs.invalidBenchmarkCount ?? 0} />
        <StatBadge label="権限ブロック" value={outputs.permissionBlockedCount ?? 0} />
        <StatBadge label="未解決カラム" value={outputs.unresolvedColumnCount ?? 0} />
        <StatBadge label="ハーネスリトライ" value={outputs.harnessRetryCount ?? 0} />
      </div>

      {judgeScores && Object.keys(judgeScores).length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted">ジャッジスコア</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(judgeScores).map(([name, score]) => (
              <JudgeScoreBadge key={name} name={name} score={score} />
            ))}
          </div>
        </div>
      )}

      {sampleQuestions && sampleQuestions.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted">サンプル評価質問</p>
          <div className="space-y-1">
            {sampleQuestions.map((q, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded border border-default bg-elevated/30 px-3 py-1.5 text-xs"
              >
                <span className="text-muted">result_correctness: {String(q.resultCorrectness ?? "—")}</span>
                {q.question && <span className="text-primary truncate ml-2">{q.question}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {outputs.evaluationRunUrl && (
        <a
          href={outputs.evaluationRunUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-default bg-elevated px-3 py-1.5 text-xs font-medium text-primary hover:bg-elevated/80 transition-colors"
        >
          Open baseline evaluation run
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  )
}

function EnrichmentContent({ outputs }: { outputs: Record<string, any> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <StatBadge label="エンリッチメント合計" value={outputs.totalEnrichments} />
    </div>
  )
}

function OptimizationContent({ outputs }: { outputs: Record<string, any> }) {
  const leversAccepted = outputs.leversAccepted as any[] | undefined
  const leversRolledBack = outputs.leversRolledBack as any[] | undefined
  const baselineAcc = outputs.baselineAccuracy != null ? Number(outputs.baselineAccuracy) : null
  const bestAcc = outputs.bestAccuracy != null ? Number(outputs.bestAccuracy) : null
  const bNorm = baselineAcc != null ? (baselineAcc > 1 ? baselineAcc : baselineAcc * 100) : null
  const oNorm = bestAcc != null ? (bestAcc > 1 ? bestAcc : bestAcc * 100) : null
  const delta = bNorm != null && oNorm != null ? oNorm - bNorm : null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <StatBadge label="適用パッチ" value={outputs.patchesApplied} />
        <StatBadge label="適用レバー" value={leversAccepted?.length} />
        <StatBadge label="ロールバックレバー" value={leversRolledBack?.length} />
        <StatBadge label="イテレーション" value={outputs.iterationCounter} />
      </div>
      {bNorm != null && oNorm != null && (
        <p className="text-xs font-medium">
          スコア: {bNorm.toFixed(1)}% → {oNorm.toFixed(1)}%{" "}
          <span className={delta != null && delta > 0 ? "text-emerald-600" : "text-red-500"}>
            ({delta != null && delta > 0 ? "+" : ""}{delta?.toFixed(1)}%)
          </span>
        </p>
      )}
    </div>
  )
}

function FinalizationContent({ outputs }: { outputs: Record<string, any> }) {
  const bestAcc = outputs.bestAccuracy != null ? Number(outputs.bestAccuracy) : null
  const bNorm = bestAcc != null ? (bestAcc > 1 ? bestAcc : bestAcc * 100) : null
  const rep = outputs.repeatability != null ? Number(outputs.repeatability) : null
  const repNorm = rep != null ? (rep > 1 ? rep : rep * 100) : null
  const hoAcc = outputs.heldOutAccuracy != null ? Number(outputs.heldOutAccuracy) : null
  const hoNorm = hoAcc != null ? (hoAcc > 1 ? hoAcc : hoAcc * 100) : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <StatBadge label="最高精度" value={bNorm != null ? `${bNorm.toFixed(1)}%` : null} />
        <StatBadge label="再現性" value={repNorm != null ? `${repNorm.toFixed(1)}%` : null} />
        {hoNorm != null && (
          <StatBadge
            label="ホールドアウト"
            value={`${hoNorm.toFixed(1)}% (${outputs.heldOutCount ?? "?"} 問)${outputs.heldOutDeltaPp != null ? ` ${Number(outputs.heldOutDeltaPp).toFixed(1)}pp トレーニング上回り` : ""}`}
          />
        )}
        {outputs.convergenceReason && (
          <StatBadge label="収束" value={outputs.convergenceReason} />
        )}
      </div>

      {outputs.ucModelName && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          UCモデル: {outputs.ucModelName}
          {outputs.ucModelVersion && ` v${outputs.ucModelVersion}`}
          {" \u2014 "}
          {outputs.ucChampionPromoted ? "チャンピオンに昇格" : "登録済（既存チャンピオンを保持）"}
        </div>
      )}
    </div>
  )
}

function DeployContent({ outputs }: { outputs: Record<string, any> }) {
  return (
    <p className="text-xs text-muted">
      デプロイ {outputs.deployStatus ?? "待機中"}
    </p>
  )
}

export function StepDetailContent({ step }: StepDetailContentProps) {
  const outputs = step.outputs
  if (!outputs) return null

  switch (step.stepNumber) {
    case 1: return <PreflightContent outputs={outputs} />
    case 2: return <BaselineContent outputs={outputs} />
    case 3: return <EnrichmentContent outputs={outputs} />
    case 4: return <OptimizationContent outputs={outputs} />
    case 5: return <FinalizationContent outputs={outputs} />
    case 6: return <DeployContent outputs={outputs} />
    default: return null
  }
}
