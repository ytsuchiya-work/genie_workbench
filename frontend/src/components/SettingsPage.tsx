/**
 * Settings page component showing read-only configuration values.
 */

import { useState, useEffect } from "react"
import { ArrowLeft, Loader2, Server, Brain, Database, Globe, FolderOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getSettings } from "@/lib/api"
import type { AppSettings } from "@/types"

interface SettingsPageProps {
  onBack: () => void
  currentGenieSpaceId?: string
}

interface SettingItemProps {
  icon: React.ReactNode
  label: string
  value: string | null
  description?: string
}

function SettingItem({ icon, label, value, description }: SettingItemProps) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-lg bg-elevated">
      <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-secondary">{label}</p>
        <p className="font-mono text-sm text-primary break-all">
          {value || <span className="text-muted italic">未設定</span>}
        </p>
        {description && (
          <p className="text-xs text-muted mt-1">{description}</p>
        )}
      </div>
    </div>
  )
}

export function SettingsPage({ onBack, currentGenieSpaceId }: SettingsPageProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await getSettings()
        setSettings(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "設定の読み込みに失敗しました")
      } finally {
        setIsLoading(false)
      }
    }
    loadSettings()
  }, [])

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          戻る
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-display font-bold text-primary">
          設定
        </h1>
        <p className="text-muted">
          現在の設定（読み取り専用）
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted" />
            </div>
          )}

          {error && (
            <div className="text-center py-12 text-danger">
              <p>{error}</p>
            </div>
          )}

          {settings && (
            <>
              <SettingItem
                icon={<Server className="w-5 h-5" />}
                label="Genie スペース ID"
                value={currentGenieSpaceId || settings.genie_space_id}
                description="現在分析中のGenie スペース"
              />

              <SettingItem
                icon={<Brain className="w-5 h-5" />}
                label="LLMモデル"
                value={settings.llm_model}
                description="分析に使用する言語モデル"
              />

              <SettingItem
                icon={<Database className="w-5 h-5" />}
                label="SQLウェアハウス ID"
                value={settings.sql_warehouse_id}
                description="ベンチマークSQLクエリを実行するウェアハウス"
              />

              <SettingItem
                icon={<Globe className="w-5 h-5" />}
                label="Databricks ホスト"
                value={settings.databricks_host}
                description="接続先Databricksワークスペース"
              />

              <SettingItem
                icon={<FolderOpen className="w-5 h-5" />}
                label="ワークスペースディレクトリ"
                value={settings.workspace_directory}
                description="新規Genie スペースの作成先ディレクトリ"
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
