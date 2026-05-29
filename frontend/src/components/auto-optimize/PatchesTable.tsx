import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { getAutoOptimizePatches } from "@/lib/api"
import type { GSOPatch } from "@/types"

interface PatchesTableProps {
  runId: string
}

const LEVER_NAMES: Record<number, string> = {
  0: "genie_config",
  1: "テーブル & カラム",
  2: "メトリックビュー",
  3: "SQLクエリ & 関数",
  4: "結合",
  5: "テキスト指示",
  6: "SQL式",
}

const STATUS_COLORS: Record<string, "success" | "danger" | "warning" | "secondary" | "info"> = {
  accepted: "success",
  rejected: "danger",
  applied: "success",
  rolled_back: "warning",
  pending: "secondary",
}

export function PatchesTable({ runId }: PatchesTableProps) {
  const [patches, setPatches] = useState<GSOPatch[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  useEffect(() => {
    setLoading(true)
    getAutoOptimizePatches(runId)
      .then(setPatches)
      .finally(() => setLoading(false))
  }, [runId])

  function toggleRow(index: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-default p-6">
        <h3 className="text-sm font-semibold text-primary mb-3">全パッチ</h3>
        <p className="text-sm text-muted animate-pulse text-center py-6">パッチを読み込み中...</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-default p-6">
      <h3 className="text-sm font-semibold text-primary mb-4">全パッチ ({patches.length})</h3>

      {patches.length === 0 ? (
        <p className="text-sm text-muted text-center py-6">パッチが見つかりません</p>
      ) : (
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-default">
                <th className="w-8 px-2 py-2" />
                <th className="text-left px-3 py-2 text-xs font-medium text-muted">イテレーション</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted">レバー</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted">タイプ</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted">ターゲット</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted">スコープ</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted">リスク</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted">ステータス</th>
              </tr>
            </thead>
            <tbody>
              {patches.map((patch, i) => {
                const isExpanded = expandedRows.has(i)
                const hasCommand = !!patch.command
                return (
                  <tr key={i} className="border-b border-default last:border-0">
                    <td colSpan={8} className="p-0">
                      <div>
                        <button
                          onClick={() => hasCommand && toggleRow(i)}
                          className={`flex w-full items-center text-left hover:bg-elevated/50 transition-colors ${hasCommand ? "cursor-pointer" : "cursor-default"}`}
                        >
                          <div className="w-8 px-2 py-2 flex items-center justify-center">
                            {hasCommand && (
                              isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5 text-muted" />
                                : <ChevronRight className="h-3.5 w-3.5 text-muted" />
                            )}
                          </div>
                          <div className="px-3 py-2 text-muted">{patch.iteration}</div>
                          <div className="px-3 py-2 text-muted">{LEVER_NAMES[patch.lever ?? 0] ?? `レバー ${patch.lever}`}</div>
                          <div className="px-3 py-2 text-primary">{patch.patch_type}</div>
                          <div className="px-3 py-2 text-primary font-mono text-xs flex-1 truncate max-w-[200px]" title={patch.target_object}>
                            {patch.target_object}
                          </div>
                          <div className="px-3 py-2 text-muted">{patch.scope}</div>
                          <div className="px-3 py-2 text-muted">{patch.risk_level}</div>
                          <div className="px-3 py-2">
                            <Badge variant={STATUS_COLORS[patch.status?.toLowerCase()] ?? "secondary"}>
                              {patch.status}
                            </Badge>
                          </div>
                        </button>
                        {isExpanded && patch.command && (
                          <div className="mx-8 mb-3 rounded-lg bg-elevated p-3 overflow-x-auto">
                            <pre className="text-xs font-mono text-muted whitespace-pre-wrap">{
                              typeof patch.command === "string"
                                ? tryFormatJson(patch.command)
                                : JSON.stringify(patch.command, null, 2)
                            }</pre>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function tryFormatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2)
  } catch {
    return str
  }
}
