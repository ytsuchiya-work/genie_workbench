import { useState } from "react"
import { AlertTriangle, Rocket } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { triggerAutoOptimize } from "@/lib/api"
import { PermissionAlert } from "@/components/auto-optimize/PermissionAlert"
import type { GSOPermissionCheck } from "@/types"

interface OptimizationConfigProps {
  spaceId: string
  onStarted: (runId: string) => void
  onTriggerStart?: () => void
  onTriggerError?: (message: string) => void
  hasActiveRun: boolean
  permissions: GSOPermissionCheck | null
  permsLoading: boolean
  healthIssues?: string[]
  onRefreshPermissions?: () => void
}

const LEVERS = [
  { id: 1, name: "テーブルとカラム", description: "テーブルの説明、カラムの説明、同義語を更新" },
  { id: 2, name: "メトリクスビュー", description: "メトリクスビューのカラム説明を更新" },
  { id: 3, name: "SQLクエリと関数", description: "サンプルSQLの追加・更新、パフォーマンスの低いTVFを削除" },
  { id: 4, name: "結合仕様", description: "結合関係の追加、更新、削除" },
  { id: 5, name: "テキスト指示", description: "グローバルルーティング指示を書き換え" },
  { id: 6, name: "SQL式", description: "再利用可能なSQL式（メジャー、フィルター、ディメンション）を追加" },
]

export function OptimizationConfig({ spaceId, onStarted, onTriggerStart, onTriggerError, hasActiveRun, permissions, permsLoading, healthIssues, onRefreshPermissions }: OptimizationConfigProps) {
  const [selectedLevers, setSelectedLevers] = useState<Set<number>>(new Set(LEVERS.map((l) => l.id)))
  const [applyMode] = useState<"genie_config" | "both">("genie_config")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasHealthIssues = (healthIssues?.length ?? 0) > 0
  const canStart = permissions?.can_start === true && !hasHealthIssues

  function toggleLever(id: number) {
    setSelectedLevers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleStart() {
    setLoading(true)
    setError(null)
    onTriggerStart?.()
    try {
      const result = await triggerAutoOptimize({
        space_id: spaceId,
        apply_mode: applyMode,
        levers: Array.from(selectedLevers).sort(),
      })
      onStarted(result.runId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "最適化の開始に失敗しました"
      setError(msg)
      onTriggerError?.(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>最適化設定</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start gap-6">
          {/* Apply Mode */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted">適用モード</p>
            <span className="inline-block px-3 py-1.5 rounded-lg border border-default text-sm font-medium bg-accent text-white">
              設定のみ
            </span>
            <p className="text-xs text-muted max-w-xs">
              変更は選択したGenie Space設定にのみ適用されます。基盤となるUnity Catalogのテーブル、カラム、説明は変更されません。
            </p>
          </div>

          {/* Lever Selection */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted">最適化対象</p>
            <div className="space-y-2">
              {LEVERS.map((lever) => (
                <label key={lever.id} className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={selectedLevers.has(lever.id)}
                    onCheckedChange={() => toggleLever(lever.id)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-medium text-primary">{lever.name}</span>
                    <p className="text-xs text-muted">{lever.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Health Issues */}
        {hasHealthIssues && (
          <div className="rounded-lg bg-danger/10 border border-danger/20 px-4 py-3 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-danger">
              <AlertTriangle className="w-4 h-4" />
              設定の問題が検出されました
            </div>
            {healthIssues!.map((issue, i) => (
              <p key={i} className="text-xs text-danger/80 ml-6">{issue}</p>
            ))}
          </div>
        )}

        {/* Permission Alert */}
        {permissions && (
          <PermissionAlert permissions={permissions} loading={permsLoading} onRefresh={onRefreshPermissions} />
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-danger/10 border border-danger/20 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Start Button */}
        <button
          onClick={handleStart}
          disabled={loading || hasActiveRun || selectedLevers.size === 0 || !canStart}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-white font-semibold hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={!canStart ? "必要な権限がありません" : undefined}
        >
          <Rocket className="w-4 h-4" />
          {loading ? "開始中..." : "最適化を開始"}
        </button>
      </CardContent>
    </Card>
  )
}
