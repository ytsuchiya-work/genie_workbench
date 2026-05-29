import { useEffect, useRef, useState } from "react"
import {
  Shield,
  FileText,
  Upload,
  Rocket,
  CheckCircle,
  XCircle,
  Loader2,
  type LucideIcon,
} from "lucide-react"

interface LoadingStepperProps {
  isOpen: boolean
  isComplete: boolean
  error: string | null
  onNavigate: () => void
}

interface StepDef {
  icon: LucideIcon
  label: string
  description: string
}

const STEPS: StepDef[] = [
  { icon: Shield, label: "権限を検証中", description: "Genie SpaceとUCカタログへのアクセスを確認中" },
  { icon: FileText, label: "設定を準備中", description: "現在のスペース設定とベンチマークをスナップショット中" },
  { icon: Upload, label: "ジョブを送信中", description: "Databricksワークフロー実行を作成中" },
  { icon: Rocket, label: "パイプラインを起動中", description: "6タスク最適化DAGを開始中" },
  { icon: CheckCircle, label: "パイプライン開始済", description: "実行詳細にリダイレクト中…" },
]

const STEP_INTERVAL_MS = 800
const POST_COMPLETE_DELAY_MS = 800

export function OptimizationLoadingStepper({
  isOpen,
  isComplete,
  error,
  onNavigate,
}: LoadingStepperProps) {
  const [activeStep, setActiveStep] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setActiveStep(0)
      return
    }
    if (error) return
    if (isComplete) return

    if (activeStep < STEPS.length - 2) {
      timerRef.current = setTimeout(() => {
        setActiveStep((s) => s + 1)
      }, STEP_INTERVAL_MS)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [isOpen, activeStep, error, isComplete])

  useEffect(() => {
    if (isComplete && isOpen) {
      setActiveStep(STEPS.length - 1)
      navigateTimerRef.current = setTimeout(() => {
        onNavigate()
      }, POST_COMPLETE_DELAY_MS)
    }
    return () => {
      if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current)
    }
  }, [isComplete, isOpen, onNavigate])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Dialog panel */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-default bg-surface shadow-xl mx-4 p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-primary">
            {error ? "最適化に失敗しました" : isComplete ? "パイプラインが起動されました！" : "最適化を開始中…"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {error
              ? "パイプラインの起動中に問題が発生しました。"
              : isComplete
                ? "最適化の実行が準備できました。"
                : "最適化パイプラインを準備・送信中です。"}
          </p>
        </div>

        <div className="space-y-1 py-2">
          {STEPS.map((step, i) => {
            const StepIcon = step.icon
            const isDone = i < activeStep
            const isActive = i === activeStep && !error
            const isFailed = i === activeStep && !!error
            const isFuture = i > activeStep

            return (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-md px-3 py-2 transition-all duration-300 ${
                  isActive
                    ? "bg-accent/10"
                    : isFailed
                      ? "bg-danger/10"
                      : ""
                }`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                  {isFailed ? (
                    <XCircle className="h-5 w-5 text-danger animate-in fade-in duration-300" />
                  ) : isDone ? (
                    <CheckCircle className="h-5 w-5 text-green-500 animate-in fade-in duration-300" />
                  ) : isActive ? (
                    <Loader2 className="h-5 w-5 animate-spin text-accent" />
                  ) : (
                    <StepIcon className={`h-5 w-5 text-muted ${isFuture ? "opacity-40" : ""}`} />
                  )}
                </div>
                <div className="min-w-0">
                  <p
                    className={`text-sm font-medium leading-tight ${
                      isFailed
                        ? "text-danger"
                        : isDone
                          ? "text-primary"
                          : isActive
                            ? "text-accent"
                            : "text-muted opacity-60"
                    }`}
                  >
                    {step.label}
                  </p>
                  {(isActive || isFailed) && (
                    <p className="mt-0.5 text-xs text-muted animate-in fade-in duration-200">
                      {isFailed ? error : step.description}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {error && (
          <div className="flex justify-end pt-3">
            <button
              onClick={() => onNavigate()}
              className="px-4 py-1.5 rounded-md border border-default text-sm font-medium text-primary hover:bg-surface-hover transition-colors"
            >
              閉じる
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
