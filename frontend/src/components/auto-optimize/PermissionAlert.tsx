import { useState } from "react"
import { ShieldAlert, Check, Copy, CheckCheck, RefreshCw, AlertTriangle } from "lucide-react"
import type {
  GSOPermissionCheck,
  GSOPromptRegistryActionableBy,
  GSOPromptRegistryReasonCode,
} from "@/types"

interface PermissionAlertProps {
  permissions: GSOPermissionCheck
  loading: boolean
  onRefresh?: () => void
}

function CopyableText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-mono text-amber-900 hover:bg-amber-200 transition-colors"
      title="クリックしてコピー"
    >
      {text}
      {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3 opacity-50" />}
    </button>
  )
}

function CopyableCodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative mt-2">
      <pre className="rounded-md bg-slate-800 text-slate-100 text-xs p-3 overflow-x-auto whitespace-pre-wrap">
        {code}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
        title="クリップボードにコピー"
      >
        {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}

function PermissionStep({
  step,
  title,
  description,
  granted,
  code,
}: {
  step: number
  title: string
  description: React.ReactNode
  granted: boolean
  code?: string
}) {
  return (
    <div className={`rounded-lg border p-3 ${granted ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}>
      <div className="flex items-start gap-2">
        {granted ? (
          <span className="flex-shrink-0 mt-0.5 flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white">
            <Check className="w-3 h-3" />
          </span>
        ) : (
          <span className="flex-shrink-0 mt-0.5 flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-bold">
            {step}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${granted ? "text-green-800" : "text-amber-900"}`}>
            {title}
            {granted && <span className="ml-1.5 text-xs font-normal text-green-600">(付与済)</span>}
          </p>
          {!granted && (
            <div className="mt-1 text-xs text-amber-800">{description}</div>
          )}
          {!granted && code && <CopyableCodeBlock code={code} />}
        </div>
      </div>
    </div>
  )
}

export function PermissionAlert({ permissions, loading, onRefresh }: PermissionAlertProps) {
  if (loading) return null
  if (permissions.can_start) return null

  const missingSchemas = permissions.schemas.filter((s) => !s.read_granted)
  const allGrantSql = missingSchemas
    .map((s) => s.grant_sql)
    .filter(Boolean)
    .join("\n\n")

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <h4 className="text-sm font-semibold text-amber-900">権限不足</h4>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            再確認
          </button>
        )}
      </div>

      <div className="space-y-2">
        <PermissionStep
          step={1}
          title="Genie Spaceアクセスを付与"
          description={
            <>
              Genie Spaceの共有ダイアログを開き、{" "}
              <CopyableText text={permissions.sp_display_name || "<service-principal>"} />{" "}
              を<strong>CAN_MANAGE</strong>権限で追加してください。
            </>
          }
          granted={permissions.sp_has_manage}
        />

        {permissions.schemas.length > 0 && (
          <PermissionStep
            step={2}
            title="データアクセスを付与"
            description={
              <>
                サービスプリンシパルには基盤スキーマへの<strong>SELECT</strong>と<strong>EXECUTE</strong>権限が必要です。SQLエディタで以下を実行してください:
              </>
            }
            granted={missingSchemas.length === 0}
            code={allGrantSql || undefined}
          />
        )}

        <PromptRegistryStep
          permissions={permissions}
        />
      </div>
    </div>
  )
}

function PromptRegistryStep({ permissions }: { permissions: GSOPermissionCheck }) {
  const granted = permissions.prompt_registry_available !== false
  const code = permissions.prompt_registry_reason_code
  const actionable = permissions.prompt_registry_actionable_by
  const vendorCode = permissions.prompt_registry_error_code
  const rawError = permissions.prompt_registry_error

  // Platform-actionable failures render with a distinct visual treatment
  // (slate "notice" rather than amber "blocker") so customers know they
  // are NOT being asked to fix a permission — the Genie Workbench team is.
  if (!granted && actionable === "platform") {
    return (
      <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
        <div className="flex items-start gap-2">
          <span className="flex-shrink-0 mt-0.5 flex items-center justify-center w-5 h-5 rounded-full bg-slate-500 text-white">
            <AlertTriangle className="w-3 h-3" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800">
              {promptRegistryTitle(code, actionable)}
              <span className="ml-1.5 text-xs font-normal text-slate-500">
                (プラットフォームの問題 — 管理者タスクではありません)
              </span>
            </p>
            <div className="mt-1 text-xs text-slate-700">
              {promptRegistryDescription(code, rawError, vendorCode)}
            </div>
            {vendorCode && (
              <div className="mt-2 font-mono text-xs text-slate-600">
                error_code:{" "}
                <span className="rounded bg-slate-200 px-1 py-0.5">{vendorCode}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <PermissionStep
      step={3}
      title={promptRegistryTitle(code, actionable)}
      description={
        <>
          {promptRegistryDescription(code, rawError, vendorCode)}
          {!granted && vendorCode && (
            <div className="mt-2 font-mono text-xs">
              error_code:{" "}
              <span className="rounded bg-amber-100 px-1 py-0.5">{vendorCode}</span>
            </div>
          )}
        </>
      }
      granted={granted}
    />
  )
}

function promptRegistryTitle(
  code: GSOPromptRegistryReasonCode | null | undefined,
  actionable?: GSOPromptRegistryActionableBy | null,
): string {
  switch (code) {
    case "feature_not_enabled":
      return "MLflow Prompt Registryを有効化"
    case "missing_uc_permissions":
      return "MLflow Prompt Registry権限を付与"
    case "registry_path_not_found":
      return "MLflow Prompt Registryスキーマを確認"
    case "missing_sp_scope":
      return "Genie Workbenchを再デプロイしてSPスコープを更新"
    case "vendor_bug":
      return "MLflow Prompt Registryプラットフォームエラー"
    case "probe_error":
      return "Prompt Registryチェックを実行できませんでした"
    default:
      // Don't guess: if we don't recognize the code and the backend marks
      // it platform-actionable, say so explicitly rather than falling back
      // to "admin go enable the toggle".
      return actionable === "platform"
        ? "MLflow Prompt Registryプラットフォームエラー"
        : "MLflow Prompt Registryを有効化"
  }
}

function promptRegistryDescription(
  code: GSOPromptRegistryReasonCode | null | undefined,
  rawError: string | null,
  vendorCode: string | null | undefined,
): React.ReactNode {
  switch (code) {
    case "feature_not_enabled":
      return (
        <>
          このワークスペースではMLflow Prompt Registryが有効になっていません。{" "}
          <strong>ワークスペース管理者</strong>に連絡して、ワークスペース設定でGenAIプレビューを有効にしてください。
        </>
      )
    case "missing_uc_permissions":
      return (
        <>
          サービスプリンシパルにPrompt Registryの使用に必要なUnity Catalog権限がありません。
          UC管理者にターゲットスキーマへの<strong>CREATE FUNCTION</strong>、{" "}
          <strong>EXECUTE</strong>、<strong>MANAGE</strong>の付与を依頼し、
          <em>再確認</em>をクリックしてください。
        </>
      )
    case "registry_path_not_found":
      return (
        <>
          Prompt Registryのターゲットカタログ/スキーマが見つかりませんでした。
          GSOカタログが存在し、サービスプリンシパルに{" "}
          <strong>USE CATALOG</strong> / <strong>USE SCHEMA</strong>権限があることを確認してください。
        </>
      )
    case "missing_sp_scope":
      return (
        <>
          アプリのサービスプリンシパルトークンにPrompt RegistryのOAuthスコープがありません。
          Genie Workbenchアプリを再デプロイしてトークンが現在のワークスペースプレビュースコープを取得するようにするか、
          UC管理者にサービスプリンシパルへのアクセスを再付与してもらってください。
        </>
      )
    case "vendor_bug":
      return (
        <>
          MLflow Prompt Registryがプラットフォーム側のエラーを返しました。
          これはワークスペースから修正できるものではありません。エラーはサーバー側でログに記録されています。
          <em>再確認</em>をクリックして再試行してください。問題が続く場合は、
          実行IDと以下の<code>error_code</code>をDatabricks FEサポートに連絡してください。
        </>
      )
    case "probe_error":
      return (
        <>
          Prompt Registryのプローブを実行できませんでした。ページを再読み込みしてください。
          問題が続く場合は、以下のエラーを添えてサポートに連絡してください:
          {rawError && <div className="mt-1 font-mono">{rawError}</div>}
        </>
      )
    default:
      return (
        <>
          MLflow Prompt Registryが不明な理由で利用できません。
          <code>error_code</code>{vendorCode ? "（以下）" : ""}と生のエラーを添えてサポートに連絡してください:
          {rawError && <div className="mt-1 font-mono">{rawError}</div>}
        </>
      )
  }
}
