import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Lightbulb, Code } from "lucide-react"
import { getAutoOptimizeSuggestions } from "@/lib/api"
import type { GSOSuggestion } from "@/types"

interface SuggestionsPanelProps {
  runId: string
}

const TYPE_BADGE: Record<string, { variant: "default" | "info" | "secondary"; label: string }> = {
  METRIC_VIEW: { variant: "info", label: "メトリックビュー" },
  FUNCTION: { variant: "secondary", label: "関数" },
}

const STATUS_BADGE: Record<string, { variant: "success" | "danger" | "warning" | "secondary"; label: string }> = {
  PROPOSED: { variant: "warning", label: "提案中" },
  ACCEPTED: { variant: "success", label: "承認済" },
  REJECTED: { variant: "danger", label: "却下" },
  IMPLEMENTED: { variant: "success", label: "実装済" },
}

function SuggestionCard({ suggestion }: { suggestion: GSOSuggestion }) {
  const typeBadge = TYPE_BADGE[suggestion.suggestionType] ?? { variant: "secondary" as const, label: suggestion.suggestionType }
  const statusBadge = STATUS_BADGE[suggestion.status] ?? { variant: "secondary" as const, label: suggestion.status }

  return (
    <div className="rounded-xl border border-default bg-surface p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant={typeBadge.variant}>{typeBadge.label}</Badge>
            <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
          </div>
          <h4 className="text-sm font-semibold text-primary">{suggestion.title}</h4>
        </div>
        {suggestion.estimatedImpact && (
          <span className="text-xs text-muted shrink-0">{suggestion.estimatedImpact}</span>
        )}
      </div>

      {suggestion.rationale && (
        <p className="text-xs text-muted leading-relaxed">{suggestion.rationale}</p>
      )}

      {suggestion.definition && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted flex items-center gap-1">
            <Code className="h-3 w-3" />
            SQL定義
          </p>
          <pre className="text-xs font-mono bg-elevated rounded-lg p-3 overflow-x-auto max-h-48 text-primary/80">
            {suggestion.definition}
          </pre>
        </div>
      )}

      {suggestion.affectedQuestions.length > 0 && (
        <p className="text-xs text-muted">
          {suggestion.affectedQuestions.length} 件の質問に影響
        </p>
      )}
    </div>
  )
}

export function SuggestionsPanel({ runId }: SuggestionsPanelProps) {
  const [suggestions, setSuggestions] = useState<GSOSuggestion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getAutoOptimizeSuggestions(runId)
      .then(setSuggestions)
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false))
  }, [runId])

  if (loading) {
    return (
      <div className="rounded-xl border border-default p-8 text-center">
        <p className="text-sm text-muted animate-pulse">提案を読み込み中...</p>
      </div>
    )
  }

  if (suggestions.length === 0) {
    return (
      <div className="rounded-xl border border-default p-8 text-center space-y-2">
        <Lightbulb className="h-8 w-8 text-muted mx-auto" />
        <p className="text-sm text-primary font-medium">この実行に対する改善提案はありません。</p>
        <p className="text-xs text-muted">
          今後のイテレーションでメトリックビューまたは関数が提案される可能性があります。
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {suggestions.map((s) => (
        <SuggestionCard key={s.suggestionId} suggestion={s} />
      ))}
    </div>
  )
}
