import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { getAutoOptimizeRunsForSpace } from "@/lib/api"
import type { GSORunSummary } from "@/types"

interface RunHistoryTableProps {
  spaceId: string
  onSelectRun: (runId: string) => void
}

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "info" | "secondary"> = {
  CONVERGED: "success",
  APPLIED: "success",
  STALLED: "warning",
  MAX_ITERATIONS: "warning",
  FAILED: "danger",
  CANCELLED: "secondary",
  DISCARDED: "secondary",
  IN_PROGRESS: "info",
  RUNNING: "info",
  QUEUED: "secondary",
}

function fmtAccuracy(v: number | null): string {
  if (v == null) return "—"
  const n = Number(v)
  return `${(n > 1 ? n : n * 100).toFixed(0)}%`
}

export function RunHistoryTable({ spaceId, onSelectRun }: RunHistoryTableProps) {
  const [runs, setRuns] = useState<GSORunSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAutoOptimizeRunsForSpace(spaceId)
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false))
  }, [spaceId])

  return (
    <Card>
      <CardHeader>
        <CardTitle>最適化履歴</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted text-sm py-4">読み込み中...</p>
        ) : runs.length === 0 ? (
          <p className="text-muted text-sm py-4">過去の最適化実行はありません。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日付</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>精度</TableHead>
                <TableHead>実行者</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.run_id}>
                  <TableCell className="text-sm">
                    {run.started_at
                      ? new Date(run.started_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[run.status] ?? "secondary"}>
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {fmtAccuracy(run.best_accuracy)}
                  </TableCell>
                  <TableCell className="text-sm text-muted">
                    {run.triggered_by ?? "—"}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => onSelectRun(run.run_id)}
                      className="text-sm text-accent hover:underline"
                    >
                      詳細を表示
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
