import { useState, useRef, useEffect, useCallback } from "react"
import {
  Send,
  Bot,
  User,
  Loader2,
  Wrench,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  ExternalLink,
  AlertCircle,
  AlertTriangle,
  Info,
  Sparkles,
  Copy,
  CheckCheck,
  Database,
  Table2,
  Server,
  FileText,
  MessageSquare,
  Settings,
  Rocket,
  X,
  Pencil,
  BarChart3,
  Plus,
  RotateCcw,
  Code2,
  Link2,
  ListChecks,
  Search,
  Trash2,
  Clock,
  GitBranch,
  ShieldCheck,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { streamAgentChat, fetchCreatePreflight } from "@/lib/api"
import type { AgentChatMessage, AgentUIElement } from "@/types"
import { TableBrowserDrawer } from "@/components/TableBrowserDrawer"
import { Tooltip } from "@/components/ui/tooltip"
interface CreateAgentChatProps {
  onCreated: (spaceId: string, displayName: string, spaceUrl?: string, initialTab?: string) => void
}

let msgCounter = 0
const nextId = () => `msg-${++msgCounter}-${Date.now()}`

const TOOL_LABELS: Record<string, string> = {
  discover_catalogs: "カタログを参照中",
  discover_schemas: "スキーマを参照中",
  discover_tables: "テーブルを参照中",
  describe_table: "テーブルを検査中",
  assess_data_quality: "データ品質を評価中",
  assess_readiness: "データ準備状況を評価中",
  profile_table_usage: "テーブル使用状況とリネージをプロファイリング中",
  profile_columns: "カラムをプロファイリング中",
  test_sql: "SQLをテスト中",
  discover_warehouses: "ウェアハウスを検索中",
  generate_plan: "計画を生成中（並列）...",
  present_plan: "レビュー用計画を準備中",
  get_config_schema: "設定スキーマを取得中",
  generate_config: "設定を生成中",
  update_config: "設定を更新中",
  validate_config: "設定を検証中",
  create_space: "スペースを作成中",
  update_space: "スペースを更新中",
}

const ELEMENT_ICONS: Record<string, typeof Database> = {
  catalog_selection: Database,
  schema_selection: Database,
  table_selection: Table2,
  warehouse_selection: Server,
}

const COMBOBOX_THRESHOLD = 15

// ─── Build progress tracking ───────────────────────────────────

interface PlanSummary {
  questions: number
  benchmarks: number
  measures: number
  filters: number
  expressions: number
  exampleSqls: number
  joins: number
  textInstruction: boolean
}

interface BuildProgress {
  title: string
  description: string
  businessContext: string[]
  catalog: string
  schemas: string[]
  tables: string[]
  inspectionDone: boolean
  inspectionSummary: { qualityIssues: number; lineageCount: number; columnsProfiled: number }
  profilingDone: boolean
  profilingSummary: { overall: string; questionsAssessed: number; lowConfidence: number }
  planReady: boolean
  planSummary: PlanSummary
  configReady: boolean
  config: Record<string, unknown> | null
  spaceId: string
  spaceUrl: string
  spaceDisplayName: string
}

const EMPTY_PLAN_SUMMARY: PlanSummary = { questions: 0, benchmarks: 0, measures: 0, filters: 0, expressions: 0, exampleSqls: 0, joins: 0, textInstruction: false }

const EMPTY_PROGRESS: BuildProgress = {
  title: "",
  description: "",
  businessContext: [],
  catalog: "",
  schemas: [],
  tables: [],
  inspectionDone: false,
  inspectionSummary: { qualityIssues: 0, lineageCount: 0, columnsProfiled: 0 },
  profilingDone: false,
  profilingSummary: { overall: "", questionsAssessed: 0, lowConfidence: 0 },
  planReady: false,
  planSummary: { ...EMPTY_PLAN_SUMMARY },
  configReady: false,
  config: null,
  spaceId: "",
  spaceUrl: "",
  spaceDisplayName: "",
}

const STEPS = [
  { key: "requirements", label: "要件", Icon: FileText, backtrackMsg: "要件に戻りましょう。タイトルまたは目的を変更したいです。" },
  { key: "discovery", label: "データ検出", Icon: Database, backtrackMsg: "データ選択に戻りましょう。使用するテーブルを変更したいです。" },
  { key: "feasibility", label: "実現可能性", Icon: ShieldCheck, backtrackMsg: "データの実現可能性を再評価しましょう。" },
  { key: "inspection", label: "検査", Icon: Search, backtrackMsg: "データを再検査しましょう。品質やプロファイルを再確認したいです。" },
  { key: "profiling", label: "プロファイリング", Icon: BarChart3, backtrackMsg: "ビジネス質問に対するデータ準備状況を再評価しましょう。" },
  { key: "plan", label: "計画", Icon: ListChecks, backtrackMsg: "計画に戻りましょう。質問、指示、ベンチマークを調整したいです。" },
  { key: "config", label: "設定", Icon: Settings, backtrackMsg: "スペース作成前に設定を見直しましょう。" },
  { key: "create", label: "スペース作成", Icon: Rocket, backtrackMsg: "" },
] as const

const FIX_STEPS = [
  { key: "analyze", label: "問題を分析", Icon: Search },
  { key: "update_config", label: "設定を更新", Icon: Settings },
  { key: "apply", label: "変更を適用", Icon: Rocket },
] as const

function currentStep(p: BuildProgress): number {
  if (p.spaceId) return 7
  if (p.configReady) return 6
  if (p.planReady) return 5
  if (p.profilingDone) return 4
  if (p.inspectionDone) return 3
  if (p.tables?.length) return 2  // feasibility (tables selected)
  if (p.catalog || p.schemas?.length) return 1  // discovery
  return 0
}

// ─── Editable plan ─────────────────────────────────────────────

interface EditableColumnConfig {
  column_name: string
  description?: string
  type_hint?: string
  excluded?: boolean
}

interface EditableTable {
  identifier: string
  description: string
  column_configs: EditableColumnConfig[]
}

interface EditablePlan {
  tables: EditableTable[]
  metric_views: EditableTable[]
  sample_questions: string[]
  text_instructions: string
  join_specs: Record<string, string>[]
  measures: Record<string, string>[]
  filters: Record<string, string>[]
  expressions: Record<string, string>[]
  example_sqls: Record<string, string>[]
  benchmarks: Record<string, string>[]
}

function planFromResult(result: Record<string, unknown>): EditablePlan {
  const s = (result.sections as Record<string, unknown[]>) || {}
  const tiArr = (s.text_instructions as string[]) || []
  const rawTables = (s.tables as Record<string, unknown>[]) || []
  const rawMetricViews = (s.metric_views as Record<string, unknown>[]) || []
  const mapSource = (t: Record<string, unknown>): EditableTable => ({
    identifier: (t.identifier as string) || "",
    description: (t.description as string) || "",
    column_configs: ((t.column_configs as Record<string, unknown>[]) || []).map((c) => ({
      column_name: (c.column_name as string) || "",
      description: (c.description as string) || undefined,
      type_hint: (c.type_hint as string) || undefined,
      excluded: (c.excluded as boolean) || false,
    })),
  })
  return {
    tables: rawTables.map(mapSource),
    metric_views: rawMetricViews.map(mapSource),
    sample_questions: [...((s.sample_questions as string[]) || [])],
    text_instructions: tiArr.join("\n"),
    join_specs: (((s.join_specs || s.joins) as Record<string, string>[]) || []).map((j) => ({ ...j })),
    measures: ((s.measures as Record<string, string>[]) || []).map((m) => ({ ...m })),
    filters: ((s.filters as Record<string, string>[]) || []).map((f) => ({ ...f })),
    expressions: ((s.expressions as Record<string, string>[]) || []).map((e) => ({ ...e })),
    example_sqls: ((s.example_sqls as Record<string, string>[]) || []).map((e) => ({ ...e })),
    benchmarks: ((s.benchmarks as Record<string, string>[]) || []).map((b) => ({ ...b })),
  }
}

// ─── Session persistence ───────────────────────────────────────

const STORAGE_KEY = "genie-create-session"

interface PersistedState {
  messages: AgentChatMessage[]
  sessionId: string | null
  progress: BuildProgress
  usedElements: string[]
  panelOpen: boolean
  editedPlan?: EditablePlan | null
}

function saveState(s: PersistedState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // storage full or unavailable — silently ignore
  }
}

function loadState(): PersistedState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    // Migrate old schema (string) -> schemas (string[])
    const p = parsed.progress as any
    if (p && !Array.isArray(p.schemas)) {
      p.schemas = p.schema ? [p.schema] : []
      delete p.schema
    }
    // Migrate old sidebar fields to new BuildProgress shape
    if (p && !("inspectionDone" in p)) {
      p.inspectionDone = p.profilingDone ?? false
      p.inspectionSummary = p.inspectionSummary ?? { qualityIssues: 0, lineageCount: 0, columnsProfiled: 0 }
      p.businessContext = p.businessContext ?? []
      p.planReady = p.planReady ?? (p.sampleQuestions?.length > 0 || p.instructionCounts?.measures > 0)
      p.planSummary = p.planSummary ?? { ...EMPTY_PLAN_SUMMARY }
      delete p.profilingDone
      delete p.sampleQuestions
      delete p.instructionCounts
      delete p.benchmarks
    }
    // Migrate: add profilingDone/profilingSummary for sessions created before the profiling step
    if (p && !("profilingDone" in p)) {
      p.profilingDone = false
      p.profilingSummary = { overall: "", questionsAssessed: 0, lowConfidence: 0 }
    }
    // Migrate editedPlan: ensure benchmarks array exists
    if (parsed.editedPlan && !Array.isArray(parsed.editedPlan.benchmarks)) {
      parsed.editedPlan.benchmarks = []
    }
    // Migrate editedPlan: ensure tables array exists
    if (parsed.editedPlan && !Array.isArray(parsed.editedPlan.tables)) {
      parsed.editedPlan.tables = []
    }
    // Migrate editedPlan: ensure metric_views array exists
    if (parsed.editedPlan && !Array.isArray(parsed.editedPlan.metric_views)) {
      parsed.editedPlan.metric_views = []
    }
    // Migrate text_instructions from string[] to single string
    if (parsed.editedPlan && Array.isArray((parsed.editedPlan as any).text_instructions)) {
      parsed.editedPlan.text_instructions = ((parsed.editedPlan as any).text_instructions as string[]).join("\n")
    }
    // Migrate joins → join_specs
    if (parsed.editedPlan && (parsed.editedPlan as any).joins && !parsed.editedPlan.join_specs) {
      parsed.editedPlan.join_specs = (parsed.editedPlan as any).joins
      delete (parsed.editedPlan as any).joins
    }
    // Reconstruct editedPlan from messages if missing
    if (!parsed.editedPlan && parsed.messages) {
      for (let i = parsed.messages.length - 1; i >= 0; i--) {
        const m = parsed.messages[i]
        if (m.role === "tool" && (m.tool_name === "present_plan" || m.tool_name === "generate_plan") && m.tool_result && !m.tool_result.error) {
          parsed.editedPlan = planFromResult(m.tool_result as Record<string, unknown>)
          break
        }
      }
    }
    return parsed
  } catch {
    return null
  }
}

// ─── Message grouping ──────────────────────────────────────────

const INSPECTION_TOOLS = new Set(["describe_table", "profile_columns", "assess_data_quality", "profile_table_usage"])

// Plan sections that always appear in the review UI even when empty (so users
// know they exist and can add items manually).
const ALWAYS_SHOW_PLAN_SECTIONS = new Set([
  "sample_questions", "example_sqls", "benchmarks",
  "text_instructions", "join_specs", "sql_expressions",
])

type RenderItem =
  | { type: "message"; msg: AgentChatMessage }
  | { type: "inspection_group"; msgs: AgentChatMessage[]; id: string }

function groupMessages(msgs: AgentChatMessage[]): RenderItem[] {
  const items: RenderItem[] = []
  let group: AgentChatMessage[] = []

  const flushGroup = () => {
    if (group.length >= 2) {
      items.push({ type: "inspection_group", msgs: [...group], id: `grp-${group[0].id}` })
    } else if (group.length === 1) {
      items.push({ type: "message", msg: group[0] })
    }
    group = []
  }

  for (const msg of msgs) {
    if (msg.role === "tool" && INSPECTION_TOOLS.has(msg.tool_name || "")) {
      group.push(msg)
    } else {
      flushGroup()
      items.push({ type: "message", msg })
    }
  }
  flushGroup()
  return items
}

// ─── Component ─────────────────────────────────────────────────

export function CreateAgentChat({ onCreated }: CreateAgentChatProps) {
  const restored = useRef(loadState())
  const prefillSpaceIdRef = useRef<string | null>(null)

  const [messages, setMessages] = useState<AgentChatMessage[]>(restored.current?.messages ?? [])
  const [input, setInput] = useState("")
  const [sessionId, setSessionId] = useState<string | null>(restored.current?.sessionId ?? null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const [copiedConfig, setCopiedConfig] = useState(false)
  const [usedElements, setUsedElements] = useState<Set<string>>(
    new Set(restored.current?.usedElements ?? []),
  )
  const [multiSelections, setMultiSelections] = useState<Record<string, Set<string>>>({})
  const [progress, setProgress] = useState<BuildProgress>(restored.current?.progress ?? EMPTY_PROGRESS)
  const [panelOpen] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  // businessContextDraft state removed — was only used for add/remove business context UI
  const [expandedPlanSections, setExpandedPlanSections] = useState<Set<string>>(new Set(["sample_questions"]))
  const [agentStatus, setAgentStatus] = useState<string | null>(null)
  const [editedPlan, setEditedPlan] = useState<EditablePlan | null>(restored.current?.editedPlan ?? null)
  const [editingPlanItem, setEditingPlanItem] = useState<string | null>(null)
  const [planTab, setPlanTab] = useState<"schema" | "instructions">("schema")
  const [expandedTableId, setExpandedTableId] = useState<string | null>(null)
  const [elementSearch, setElementSearch] = useState<Record<string, string>>({})
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null)
  const [fixMode, setFixMode] = useState(false)
  const fixModeRef = useRef(false)
  const [fixStep, setFixStep] = useState(0) // 0=analyze, 1=update_config, 2=apply, 3=done
  const [fixResult, setFixResult] = useState<{ spaceId: string; url: string } | null>(null)
  const queuedMessageRef = useRef<string | null>(null)
  const [preflight, setPreflight] = useState<{ warehouses_available: boolean; obo_enabled: boolean; app_name: string } | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const sessionIdRef = useRef<string | null>(sessionId)

  // Auto-reconnect state: tracks consecutive connection failures so we can
  // retry automatically (up to a limit) when the Databricks Apps proxy drops
  // the SSE stream during long-running tool calls.
  const reconnectCountRef = useRef(0)
  const MAX_AUTO_RECONNECTS = 3

  // Streaming message state — accumulate tokens in a ref and flush to React
  // state on an animation-frame schedule to keep renders at ~60 fps.
  const streamingContentRef = useRef("")
  const streamingMsgIdRef = useRef<string | null>(null)
  const streamingRafRef = useRef<number | null>(null)

  // Persist key state to sessionStorage on change
  useEffect(() => {
    saveState({
      messages,
      sessionId,
      progress,
      usedElements: Array.from(usedElements),
      panelOpen,
      editedPlan,
    })
  }, [messages, sessionId, progress, usedElements, panelOpen, editedPlan])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, agentStatus])

  useEffect(() => {
    if (!isStreaming) inputRef.current?.focus()
  }, [isStreaming])

  useEffect(() => {
    fetchCreatePreflight()
      .then(setPreflight)
      .catch(() => setPreflight({ warehouses_available: false, obo_enabled: false, app_name: "this app" }))
  }, [])

  // Shared session reset — used by both confirmClear and prefill
  const resetSession = () => {
    stopRef.current?.()
    setMessages([])
    setSessionId(null)
    sessionIdRef.current = null
    setIsStreaming(false)
    setAgentStatus(null)
    if (streamingRafRef.current) {
      cancelAnimationFrame(streamingRafRef.current)
      streamingRafRef.current = null
    }
    streamingContentRef.current = ""
    streamingMsgIdRef.current = null
    setExpandedTools(new Set())
    setUsedElements(new Set())
    setMultiSelections({})
    setProgress(EMPTY_PROGRESS)
    setEditingTitle(false)
    setTitleDraft("")
    setExpandedPlanSections(new Set(["sample_questions"]))
    setEditedPlan(null)
    setEditingPlanItem(null)
    setPlanTab("schema")
    setExpandedTableId(null)
    reconnectCountRef.current = 0
    queuedMessageRef.current = null
    setQueuedMessage(null)
    setElementSearch({})
    setShowClearConfirm(false)
    setInput("")
    setFixMode(false)
    fixModeRef.current = false
    setFixStep(0)
    setFixResult(null)
    sessionStorage.removeItem(STORAGE_KEY)
  }

  const toggleTool = (id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── Send message + SSE streaming ─────────────────────────────

  const sendMessage = useCallback(
    (text: string, selections?: Record<string, unknown>) => {
      const isContinuation = text === ""
      if (!isContinuation && !text.trim()) return
      if (isStreaming && !isContinuation) {
        const trimmed = text.trim()
        queuedMessageRef.current = trimmed
        setQueuedMessage(trimmed)
        setInput("")
        return
      }

      if (!isContinuation) {
        const userMsg: AgentChatMessage = {
          id: nextId(),
          role: "user",
          content: text.trim(),
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, userMsg])
        setInput("")
      }
      setIsStreaming(true)

      let pendingToolCalls: AgentChatMessage[] = []

      const getStatusText = (tool: string, args: Record<string, unknown> | undefined): string => {
        const tableName = (args?.table as string)?.split(".").pop()
        const schema = args?.schema as string
        const catalog = args?.catalog as string
        switch (tool) {
          case "discover_catalogs": return "カタログを検出中..."
          case "discover_schemas": return catalog ? `${catalog}のスキーマを参照中...` : "スキーマを検出中..."
          case "discover_tables": return schema ? `${schema}のテーブルを検索中...` : "テーブルを検出中..."
          case "describe_table": return tableName ? `${tableName}を検査中...` : "テーブルを検査中..."
          case "assess_data_quality": return "データ品質を評価中..."
          case "assess_readiness": return "データ準備状況を評価中..."
          case "profile_table_usage": return "テーブル使用状況とリネージを確認中..."
          case "profile_columns": return tableName ? `${tableName}をプロファイリング中...` : "データをプロファイリング中..."
          case "test_sql": return "SQLをテスト中..."
          case "discover_warehouses": return "ウェアハウスを検索中..."
          case "generate_plan": return "計画を並列生成中..."
          case "present_plan": return "計画を準備中..."
          case "get_config_schema": return "設定スキーマを取得中..."
          case "generate_config": return "設定を生成中..."
          case "update_config": return "設定を更新中..."
          case "validate_config": return "設定を検証中..."
          case "create_space": return "スペースを作成中..."
          case "update_space": return "スペースを更新中..."
          default: return "処理中..."
        }
      }

      const flushStreamingContent = () => {
        const id = streamingMsgIdRef.current
        const content = streamingContentRef.current
        if (!id) return
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, content } : m)),
        )
      }

      // Pass spaceId on the first message (new session) for fix/update flows
      const spaceIdForRequest = !sessionIdRef.current ? prefillSpaceIdRef.current : null
      if (spaceIdForRequest) prefillSpaceIdRef.current = null

      stopRef.current = streamAgentChat(isContinuation ? "" : text.trim(), sessionIdRef.current, selections ?? null, {
        onSession: (sid) => { sessionIdRef.current = sid; setSessionId(sid); reconnectCountRef.current = 0 },
        onStep: () => {},
        onThinking: (message, _step, _round) => {
          setAgentStatus(message)
        },
        onToolCall: (tool, args) => {
          setAgentStatus(getStatusText(tool, args))

          // Advance fix-mode progress
          if (fixModeRef.current) {
            if (tool === "update_config") setFixStep((s) => Math.max(s, 1))
            else if (tool === "update_space") setFixStep((s) => Math.max(s, 2))
          }

          // Finalize any in-flight streaming message before showing tool calls
          if (streamingMsgIdRef.current) {
            if (streamingRafRef.current) {
              cancelAnimationFrame(streamingRafRef.current)
              streamingRafRef.current = null
            }
            const id = streamingMsgIdRef.current
            const content = streamingContentRef.current
            setMessages((prev) =>
              prev.map((m) => (m.id === id ? { ...m, content } : m)),
            )
            streamingContentRef.current = ""
            streamingMsgIdRef.current = null
          }

          const toolMsg: AgentChatMessage = {
            id: nextId(),
            role: "tool",
            content: TOOL_LABELS[tool] || tool,
            timestamp: Date.now(),
            tool_name: tool,
            tool_args: args,
          }
          pendingToolCalls.push(toolMsg)
          setMessages((prev) => [...prev, toolMsg])

          // Capture structured data from generate_config args for plan summary
          if (tool === "generate_config" && args) {
            const measures = (args.measures as unknown[])?.length ?? 0
            const filters = (args.filters as unknown[])?.length ?? 0
            const expressions = (args.expressions as unknown[])?.length ?? 0
            const exSqls = (args.example_sqls as unknown[])?.length ?? 0
            const hasText = !!args.text_instruction
            setProgress((p) => ({
              ...p,
              planSummary: { ...p.planSummary, measures, filters, expressions, exampleSqls: exSqls, textInstruction: hasText },
            }))
          }
        },
        onToolResult: (tool, result) => {
          let resolvedId = ""
          setMessages((prev) =>
            prev.map((m) => {
              if (m.role === "tool" && m.tool_name === tool && !m.tool_result) {
                resolvedId = m.id
                return { ...m, tool_result: result }
              }
              return m
            }),
          )

          if ((tool === "describe_table" || tool === "profile_columns" || tool === "assess_data_quality" || tool === "profile_table_usage") && !result.error) {
            setProgress((p) => {
              const updated = { ...p, inspectionDone: true }
              if (tool === "assess_data_quality") {
                const qs = (result as Record<string, unknown>).summary as { total_recommended_excludes?: number; total_recommended_review?: number } | undefined
                updated.inspectionSummary = {
                  ...p.inspectionSummary,
                  qualityIssues: (qs?.total_recommended_excludes ?? 0) + (qs?.total_recommended_review ?? 0),
                }
              }
              if (tool === "profile_table_usage") {
                const us = (result as Record<string, unknown>).summary as { tables_with_lineage?: number } | undefined
                updated.inspectionSummary = { ...updated.inspectionSummary, lineageCount: us?.tables_with_lineage ?? 0 }
              }
              if (tool === "profile_columns") {
                const profiles = (result as Record<string, unknown>).profiles as Record<string, unknown> | undefined
                updated.inspectionSummary = {
                  ...updated.inspectionSummary,
                  columnsProfiled: p.inspectionSummary.columnsProfiled + (profiles ? Object.keys(profiles).length : 0),
                }
              }
              return updated
            })
          }
          if (tool === "assess_readiness" && !result.error) {
            const r = result as Record<string, unknown>
            const qr = r.question_readiness as Record<string, { band: string }> | undefined
            const lowCount = qr ? Object.values(qr).filter((v) => v.band === "Low").length : 0
            setProgress((p) => ({
              ...p,
              profilingDone: true,
              profilingSummary: {
                overall: (r.overall_readiness as string) || "",
                questionsAssessed: qr ? Object.keys(qr).length : 0,
                lowConfidence: lowCount,
              },
            }))
          }
          if ((tool === "present_plan" || tool === "generate_plan") && !result.error) {
            if (resolvedId) setExpandedTools((et) => new Set(et).add(resolvedId))
            const plan = planFromResult(result as Record<string, unknown>)
            setEditedPlan(plan)
            setEditingPlanItem(null)
            const suggestedName = (result as Record<string, unknown>).suggested_display_name as string | undefined
            setProgress((p) => ({
              ...p,
              planReady: true,
              // Set title from LLM suggestion if user hasn't already named it
              title: p.title || suggestedName || p.title,
              planSummary: {
                questions: plan.sample_questions.length,
                benchmarks: plan.benchmarks.length,
                measures: plan.measures.length,
                filters: plan.filters.length,
                expressions: plan.expressions.length,
                exampleSqls: plan.example_sqls.length,
                joins: plan.join_specs.length,
                textInstruction: plan.text_instructions.trim().length > 0,
              },
            }))
          }

          // Derive catalog/schema/tables from tool results so the
          // progress panel stays accurate even when the user changes
          // their mind via free-text instead of clicking UI buttons.
          if (tool === "describe_table" && result.table && !result.error) {
            const parts = (result.table as string).split(".")
            if (parts.length === 3) {
              const [cat, sch, _tbl] = parts
              const fullName = result.table as string
              setProgress((p) => ({
                ...p,
                catalog: cat,
                schemas: p.schemas.includes(sch) ? p.schemas : [...p.schemas, sch],
                tables: p.tables.includes(fullName) ? p.tables : [...p.tables, fullName],
              }))
            }
          }

          // Track config generation
          if (tool === "generate_config" && result && "config" in result) {
            setProgress((p) => ({
              ...p,
              configReady: true,
              config: result.config as Record<string, unknown>,
            }))
          }

          setAgentStatus("考え中...")
        },
        onMessageDelta: (token) => {
          setAgentStatus(null)
          streamingContentRef.current += token

          if (!streamingMsgIdRef.current) {
            const id = nextId()
            streamingMsgIdRef.current = id
            setMessages((prev) => [
              ...prev,
              { id, role: "assistant", content: token, timestamp: Date.now() },
            ])
          } else if (!streamingRafRef.current) {
            streamingRafRef.current = requestAnimationFrame(() => {
              flushStreamingContent()
              streamingRafRef.current = null
            })
          }
        },
        onMessage: (content, uiElements) => {
          pendingToolCalls = []
          setAgentStatus(null)

          if (streamingRafRef.current) {
            cancelAnimationFrame(streamingRafRef.current)
            streamingRafRef.current = null
          }

          const streamId = streamingMsgIdRef.current
          if (streamId) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamId
                  ? { ...m, content: content || streamingContentRef.current, ui_elements: uiElements as AgentUIElement[] | null | undefined }
                  : m,
              ),
            )
            streamingContentRef.current = ""
            streamingMsgIdRef.current = null
          } else {
            setMessages((prev) => [
              ...prev,
              { id: nextId(), role: "assistant", content, timestamp: Date.now(), ui_elements: uiElements as AgentUIElement[] | null | undefined },
            ])
          }

        },
        onCreated: (spaceId, url, displayName) => {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: "assistant",
              content: "",
              timestamp: Date.now(),
              created_space: { space_id: spaceId, url, display_name: displayName },
            },
          ])
          setProgress((p) => ({
            ...p,
            spaceId,
            spaceUrl: url,
            spaceDisplayName: displayName,
            title: p.title || displayName,
          }))
        },
        onUpdated: (spaceId, url) => {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: "assistant",
              content: "",
              timestamp: Date.now(),
              updated_space: { space_id: spaceId, url },
            },
          ])
          if (fixModeRef.current) {
            setFixStep(3)
            setFixResult({ spaceId, url })
          }
        },
        onError: (message) => {
          setAgentStatus(null)
          if (streamingRafRef.current) {
            cancelAnimationFrame(streamingRafRef.current)
            streamingRafRef.current = null
          }
          streamingContentRef.current = ""
          streamingMsgIdRef.current = null

          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: "assistant",
              content: message,
              timestamp: Date.now(),
              is_error: true,
            } as AgentChatMessage,
          ])
        },
        onDone: (needsContinuation) => {
          setAgentStatus(null)
          // Clean up streaming refs
          if (streamingRafRef.current) {
            cancelAnimationFrame(streamingRafRef.current)
            streamingRafRef.current = null
          }
          streamingContentRef.current = ""
          streamingMsgIdRef.current = null
          pendingToolCalls = []

          // Auto-reconnect on proxy/network disconnects (up to MAX_AUTO_RECONNECTS).
          // The backend session is persisted and orphaned tool calls are healed,
          // so resuming with an empty message picks up exactly where we left off.
          if (needsContinuation === "connection_lost" && sessionIdRef.current) {
            reconnectCountRef.current += 1
            if (reconnectCountRef.current <= MAX_AUTO_RECONNECTS) {
              const attempt = reconnectCountRef.current
              setAgentStatus(`再接続中（試行 ${attempt}/${MAX_AUTO_RECONNECTS}）...`)
              setTimeout(() => sendMessage(""), 2000 * attempt)
              return
            }
            // Exhausted retries — show error and stop
            setMessages((prev) => [
              ...prev,
              {
                id: nextId(),
                role: "assistant",
                content: "複数回の再試行後に接続が切断されました。セッションは保存されています。送信をクリックして再開してください。",
                timestamp: Date.now(),
                is_error: true,
              } as AgentChatMessage,
            ])
            reconnectCountRef.current = 0
            setIsStreaming(false)
            return
          }

          if (needsContinuation && sessionIdRef.current) {
            // Keep isStreaming=true — the agent loop continues in the
            // next HTTP round.  sendMessage("") opens a new SSE stream.
            reconnectCountRef.current = 0  // successful round — reset reconnect counter
            requestAnimationFrame(() => sendMessage(""))
            return
          }

          reconnectCountRef.current = 0
          setIsStreaming(false)
          const pending = queuedMessageRef.current
          queuedMessageRef.current = null
          setQueuedMessage(null)
          if (pending) {
            requestAnimationFrame(() => sendMessage(pending))
          }
        },
      }, spaceIdForRequest)
    },
    [sessionId, isStreaming],
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleStop = () => {
    stopRef.current?.()
    setIsStreaming(false)
    setAgentStatus(null)
    queuedMessageRef.current = null
    setQueuedMessage(null)
    if (streamingRafRef.current) {
      cancelAnimationFrame(streamingRafRef.current)
      streamingRafRef.current = null
    }
    streamingContentRef.current = ""
    streamingMsgIdRef.current = null
  }

  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const handleClear = () => {
    setShowClearConfirm(true)
  }

  const confirmClear = () => resetSession()

  const handleCopyConfig = (config: Record<string, unknown>) => {
    navigator.clipboard.writeText(JSON.stringify(config, null, 2))
    setCopiedConfig(true)
    setTimeout(() => setCopiedConfig(false), 2000)
  }

  // ─── Interactive selections → update progress ─────────────────

  const handleSingleSelect = (msgId: string, el: AgentUIElement, option: { value: string; label: string }) => {
    const key = `${msgId}:${el.id}`
    if (isStreaming || usedElements.has(key)) return
    setUsedElements((prev) => new Set(prev).add(key))
    const selectionData = { [el.id]: option.value }

    if (el.id === "catalog_selection") {
      setProgress((p) => ({ ...p, catalog: option.value, schemas: [], tables: [] }))
    } else if (el.id === "schema_selection") {
      setProgress((p) => ({
        ...p,
        schemas: p.schemas.includes(option.value) ? p.schemas : [...p.schemas, option.value],
      }))
    }

    sendMessage(`${option.label}を選択します`, selectionData)
  }

  const toggleMultiOption = (key: string, value: string) => {
    setMultiSelections((prev) => {
      const current = new Set(prev[key] || [])
      if (current.has(value)) current.delete(value)
      else current.add(value)
      return { ...prev, [key]: current }
    })
  }

  const confirmMultiSelect = (msgId: string, el: AgentUIElement) => {
    const key = `${msgId}:${el.id}`
    const selected = multiSelections[key]
    if (!selected || selected.size === 0 || isStreaming || usedElements.has(key)) return
    setUsedElements((prev) => new Set(prev).add(key))

    const selectedLabels =
      el.options?.filter((o) => selected.has(o.value)).map((o) => o.label) || []
    const selectionData = { [el.id]: Array.from(selected) }

    if (el.id === "table_selection") {
      setProgress((p) => {
        const merged = new Set([...p.tables, ...selected])
        return { ...p, tables: Array.from(merged) }
      })
    }

    const itemType = el.id === "catalog_selection" ? "カタログ" : el.id === "schema_selection" ? "スキーマ" : "テーブル"
    sendMessage(
      `${selectedLabels.length}個の${itemType}を選択しました: ${selectedLabels.join(", ")}`,
      selectionData,
    )
  }

  // Panel: submit title edit
  const submitTitle = () => {
    if (!titleDraft.trim()) return
    setProgress((p) => ({ ...p, title: titleDraft.trim() }))
    setEditingTitle(false)
    sendMessage(`スペース名は「${titleDraft.trim()}」にしてください`)

  }

  // Panel: remove a table
  const removeTable = (t: string) => {
    setProgress((p) => ({ ...p, tables: p.tables.filter((x) => x !== t) }))
    const short = t.split(".").pop() || t
    sendMessage(`${short}テーブルを選択から削除してください`)
  }


  // ─── Render helpers ───────────────────────────────────────────

  const renderColumnBadge = (label: string, colorClass: string, title?: string) => (
    <span
      title={title}
      className={`ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${colorClass}`}
    >
      {label}
    </span>
  )

  const renderColumnBadges = (col: {
    name: string;
    pii_hint?: boolean;
    recommendations?: { action: string; reason: string; detail?: string; confidence?: string }[];
  }) => {
    const badges: React.ReactNode[] = []
    const reasons = new Set<string>()

    if (col.recommendations) {
      for (const rec of col.recommendations) {
        reasons.add(rec.reason)
      }
    }

    if (col.pii_hint || reasons.has("pii"))
      badges.push(renderColumnBadge("PII", "bg-amber-500/15 text-amber-500", "機密の可能性があるカラム"))
    if (reasons.has("etl_metadata"))
      badges.push(renderColumnBadge("ETL", "bg-zinc-500/15 text-zinc-400", "ETL/メタデータカラム — 非表示を検討"))
    if (reasons.has("all_null"))
      badges.push(renderColumnBadge("EMPTY", "bg-red-500/15 text-red-400", "100% Null値"))
    if (reasons.has("high_null_rate")) {
      const detail = col.recommendations?.find(r => r.reason === "high_null_rate")?.detail
      badges.push(renderColumnBadge(detail || "HIGH NULL", "bg-orange-500/15 text-orange-400", "Null率が高い"))
    }
    if (reasons.has("constant_value"))
      badges.push(renderColumnBadge("CONSTANT", "bg-zinc-500/15 text-zinc-400", "単一のユニーク値"))
    if (reasons.has("inconsistent_boolean") || reasons.has("boolean_as_string"))
      badges.push(renderColumnBadge("BOOL STR", "bg-purple-500/15 text-purple-400", "大小文字が混在した文字列として保存されたブール値"))
    if (reasons.has("inconsistent_casing"))
      badges.push(renderColumnBadge("CASING", "bg-purple-500/15 text-purple-400", "値間で大小文字が不一致"))

    return badges.length > 0 ? <>{badges}</> : null
  }

  const renderDescribeCard = (result: Record<string, unknown>) => {
    const columns = (result.columns as {
      name: string;
      type: string;
      description?: string;
      pii_hint?: boolean;
      recommendations?: { action: string; reason: string; detail?: string; confidence?: string }[];
    }[]) || []
    const sampleRows = (result.sample_rows as Record<string, unknown>[]) || []
    const ucUrl = result.uc_url as string | undefined
    const tableName = result.table as string | undefined
    const comment = result.comment as string | undefined
    const recommendations = result.recommendations as {
      exclude_pii?: string[];
      exclude_etl?: string[];
    } | undefined
    const colNames = columns.slice(0, 12).map((c) => c.name)

    const excludeCount = (recommendations?.exclude_pii?.length || 0) + (recommendations?.exclude_etl?.length || 0)

    return (
      <div className="mt-2 border border-default rounded-lg overflow-hidden bg-surface text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-surface-secondary border-b border-default">
          <div className="flex items-center gap-2">
            <Table2 className="w-3.5 h-3.5 text-accent" />
            <span className="font-semibold text-primary">{tableName?.split(".").pop()}</span>
            <span className="text-muted">{columns.length} カラム</span>
            {excludeCount > 0 && (
              <span className="text-muted">
                · {excludeCount} 非表示推奨
              </span>
            )}
          </div>
          {ucUrl && (
            <a
              href={ucUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-accent hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              UCで表示
            </a>
          )}
        </div>
        {comment && <div className="px-3 py-1.5 text-muted border-b border-default italic">{comment}</div>}

        {/* Column schema */}
        <div className="max-h-48 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-muted border-b border-default">
                <th className="px-3 py-1.5 font-medium">カラム</th>
                <th className="px-3 py-1.5 font-medium">型</th>
                <th className="px-3 py-1.5 font-medium">説明</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => (
                <tr key={col.name} className="border-b border-default last:border-0">
                  <td className="px-3 py-1 font-mono text-primary">
                    {col.name}
                    {renderColumnBadges(col)}
                  </td>
                  <td className="px-3 py-1 text-muted font-mono">{col.type}</td>
                  <td className="px-3 py-1 text-secondary">{col.description || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sample data */}
        {sampleRows.length > 0 && (
          <>
            <div className="px-3 py-1.5 bg-surface-secondary border-t border-default text-muted font-medium">
              サンプルデータ ({sampleRows.length} 行)
            </div>
            <div className="overflow-x-auto max-h-40">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-muted border-b border-default">
                    {colNames.map((n) => (
                      <th key={n} className="px-2 py-1 font-medium whitespace-nowrap">{n}</th>
                    ))}
                    {columns.length > 12 && <th className="px-2 py-1 text-muted">...</th>}
                  </tr>
                </thead>
                <tbody>
                  {sampleRows.map((row, ri) => (
                    <tr key={ri} className="border-b border-default last:border-0">
                      {colNames.map((n) => (
                        <td key={n} className="px-2 py-1 font-mono whitespace-nowrap max-w-[200px] truncate text-secondary">
                          {row[n] == null ? <span className="text-muted italic">null</span> : String(row[n])}
                        </td>
                      ))}
                      {columns.length > 12 && <td className="px-2 py-1 text-muted">...</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    )
  }

  const renderQualityCard = (result: Record<string, unknown>) => {
    const tables = (result.tables || {}) as Record<string, {
      total_rows?: number;
      column_quality?: Record<string, {
        null_rate?: number;
        empty_rate?: number;
        distinct_count?: number;
        boolean_as_string?: { normalized: string; variants: string[]; count: number }[];
        inconsistent_casing?: { normalized: string; variants: string[]; variant_count: number }[];
        recommendations?: { action: string; reason: string; detail?: string }[];
        error?: string;
      }>;
      summary?: {
        good_columns?: number;
        sparse_columns?: number;
        empty_columns?: number;
        constant_columns?: number;
        recommended_excludes?: string[];
        recommended_review?: string[];
      };
      error?: string;
    }>
    const globalSummary = result.summary as {
      tables_assessed?: number;
      tables_with_issues?: number;
      total_recommended_excludes?: number;
      total_recommended_review?: number;
    } | undefined

    const reasonBadge = (reason: string) => {
      const map: Record<string, { label: string; color: string }> = {
        all_null: { label: "EMPTY", color: "bg-red-500/15 text-red-400" },
        high_null_rate: { label: "HIGH NULL", color: "bg-orange-500/15 text-orange-400" },
        constant_value: { label: "CONSTANT", color: "bg-zinc-500/15 text-zinc-400" },
        inconsistent_boolean: { label: "BOOL CASING", color: "bg-purple-500/15 text-purple-400" },
        boolean_as_string: { label: "BOOL STR", color: "bg-purple-500/15 text-purple-400" },
        inconsistent_casing: { label: "CASING", color: "bg-purple-500/15 text-purple-400" },
        etl_metadata: { label: "ETL", color: "bg-zinc-500/15 text-zinc-400" },
        pii: { label: "PII", color: "bg-amber-500/15 text-amber-500" },
      }
      const m = map[reason] || { label: reason.toUpperCase(), color: "bg-zinc-500/15 text-zinc-400" }
      return (
        <span key={reason} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${m.color}`}>
          {m.label}
        </span>
      )
    }

    return (
      <div className="mt-2 border border-default rounded-lg overflow-hidden bg-surface text-xs">
        {/* Header */}
        <div className="px-3 py-2 bg-surface-secondary border-b border-default flex items-center gap-2">
          <Table2 className="w-3.5 h-3.5 text-accent" />
          <span className="font-semibold text-primary">データ品質評価</span>
          {globalSummary && (
            <span className="text-muted">
              {globalSummary.tables_assessed} テーブル
              {(globalSummary.total_recommended_excludes ?? 0) > 0 && (
                <> · <span className="text-red-400">{globalSummary.total_recommended_excludes} 非表示推奨</span></>
              )}
              {(globalSummary.total_recommended_review ?? 0) > 0 && (
                <> · <span className="text-orange-400">{globalSummary.total_recommended_review} 要確認</span></>
              )}
            </span>
          )}
        </div>

        {/* Per-table results */}
        <div className="max-h-64 overflow-auto divide-y divide-default">
          {Object.entries(tables).map(([tbl, data]) => {
            if (data.error) {
              return (
                <div key={tbl} className="px-3 py-2">
                  <span className="font-mono text-primary">{tbl.split(".").pop()}</span>
                  <span className="ml-2 text-red-400">エラー: {data.error}</span>
                </div>
              )
            }
            const quality = data.column_quality || {}
            const flagged = Object.entries(quality).filter(
              ([, m]) => m.recommendations && m.recommendations.length > 0
            )
            if (flagged.length === 0) {
              return (
                <div key={tbl} className="px-3 py-2">
                  <span className="font-mono text-primary">{tbl.split(".").pop()}</span>
                  <span className="ml-2 text-emerald-400">問題なし</span>
                  <span className="text-muted ml-1">({data.total_rows?.toLocaleString()} 行)</span>
                </div>
              )
            }
            return (
              <div key={tbl} className="px-3 py-2">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-mono font-semibold text-primary">{tbl.split(".").pop()}</span>
                  <span className="text-muted">{data.total_rows?.toLocaleString()} 行 · {flagged.length} フラグ付き</span>
                </div>
                <div className="space-y-1">
                  {flagged.map(([colName, metrics]) => (
                    <div key={colName} className="flex items-center gap-2 pl-2">
                      <span className="font-mono text-secondary w-40 truncate" title={colName}>{colName}</span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {metrics.recommendations?.map((rec) => reasonBadge(rec.reason))}
                        {metrics.null_rate !== undefined && metrics.null_rate > 0 && (
                          <span className="text-muted">{(metrics.null_rate * 100).toFixed(0)}% null</span>
                        )}
                      </div>
                      {metrics.inconsistent_casing && metrics.inconsistent_casing.length > 0 && (
                        <span className="text-muted truncate" title={metrics.inconsistent_casing.map(c => c.variants.join(", ")).join("; ")}>
                          例: {metrics.inconsistent_casing[0].variants.slice(0, 3).join(", ")}
                        </span>
                      )}
                      {metrics.boolean_as_string && metrics.boolean_as_string.length > 0 && !metrics.inconsistent_casing?.length && (
                        <span className="text-muted truncate" title={metrics.boolean_as_string.map(b => b.variants.join(", ")).join("; ")}>
                          例: {metrics.boolean_as_string[0].variants.slice(0, 3).join(", ")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderUsageCard = (result: Record<string, unknown>) => {
    const tables = (result.tables || {}) as Record<string, {
      lineage?: { upstream?: string[]; downstream?: string[]; error?: string };
      recent_queries?: { query_preview?: string; executed_by?: string; duration_ms?: number }[];
    }>
    const summary = result.summary as {
      tables_with_lineage?: number; total_upstream_sources?: number;
      total_downstream_consumers?: number; recent_query_count?: number;
    } | undefined
    const sysAvailable = result.system_tables_available as boolean | undefined

    return (
      <div className="mt-2 border border-default rounded-lg overflow-hidden bg-surface text-xs">
        <div className="flex items-center justify-between px-3 py-2 bg-surface-secondary border-b border-default">
          <div className="flex items-center gap-2">
            <GitBranch className="w-3.5 h-3.5 text-accent" />
            <span className="font-semibold text-primary">テーブル使用状況 & リネージ</span>
            {sysAvailable === false && (
              <span className="px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600 text-[10px] font-medium">システムテーブル利用不可</span>
            )}
          </div>
          {summary && (
            <span className="text-muted">
              {summary.total_upstream_sources ?? 0} 上流 · {summary.total_downstream_consumers ?? 0} 下流 · {summary.recent_query_count ?? 0} クエリ
            </span>
          )}
        </div>
        <div className="max-h-64 overflow-auto divide-y divide-[var(--border-color)]">
          {Object.entries(tables).map(([tbl, info]) => (
            <div key={tbl} className="px-3 py-2">
              <span className="font-mono font-medium text-primary">{tbl.split(".").pop()}</span>
              {info.lineage?.error ? (
                <span className="ml-2 text-muted italic">リネージ利用不可</span>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1">
                  {(info.lineage?.upstream || []).map((u, i) => (
                    <span key={`u-${i}`} className="inline-block px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono text-[10px]">
                      ← {u.split(".").pop()}
                    </span>
                  ))}
                  {(info.lineage?.downstream || []).map((d, i) => (
                    <span key={`d-${i}`} className="inline-block px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[10px]">
                      → {d.split(".").pop()}
                    </span>
                  ))}
                  {!(info.lineage?.upstream?.length) && !(info.lineage?.downstream?.length) && (
                    <span className="text-muted italic">リネージが見つかりません</span>
                  )}
                </div>
              )}
              {(info.recent_queries?.length ?? 0) > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {info.recent_queries!.slice(0, 3).map((q, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px] text-muted">
                      <span className="font-mono truncate max-w-[400px]">{q.query_preview?.slice(0, 120)}</span>
                      {q.duration_ms != null && (
                        <span className="shrink-0 text-secondary/60">{(q.duration_ms / 1000).toFixed(1)}s</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderProfileCard = (result: Record<string, unknown>) => {
    const profiles = (result.profiles as Record<string, { distinct_values?: unknown[]; has_more?: boolean; error?: string }>) || {}
    const ucUrl = result.uc_url as string | undefined
    const tableName = result.table as string | undefined
    const profileEntries = Object.entries(profiles)

    return (
      <div className="mt-2 border border-default rounded-lg overflow-hidden bg-surface text-xs">
        <div className="flex items-center justify-between px-3 py-2 bg-surface-secondary border-b border-default">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5 text-accent" />
            <span className="font-semibold text-primary">カラムプロファイル</span>
            <span className="text-muted">{tableName?.split(".").pop()}</span>
          </div>
          {ucUrl && (
            <a href={ucUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent hover:underline">
              <ExternalLink className="w-3 h-3" /> UCで表示
            </a>
          )}
        </div>
        <div className="max-h-64 overflow-auto divide-y divide-[var(--border-color)]">
          {profileEntries.map(([colName, prof]) => (
            <div key={colName} className="px-3 py-2">
              <span className="font-mono font-medium text-primary">{colName}</span>
              {prof.error ? (
                <span className="ml-2 text-red-400">{prof.error}</span>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1">
                  {(prof.distinct_values || []).slice(0, 15).map((v, i) => (
                    <span key={i} className="inline-block px-1.5 py-0.5 rounded bg-surface-secondary text-secondary font-mono">
                      {String(v)}
                    </span>
                  ))}
                  {prof.has_more && (
                    <span className="inline-block px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">
                      20以上の値
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const togglePlanSection = (key: string) => {
    setExpandedPlanSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ─── Plan editing helpers ──────────────────────────────────────

  const updatePlanList = (key: keyof EditablePlan, index: number, value: string) => {
    setEditedPlan((prev) => {
      if (!prev) return prev
      const arr = [...(prev[key] as string[])]
      arr[index] = value
      return { ...prev, [key]: arr }
    })
  }

  const removePlanItem = (key: keyof EditablePlan, index: number) => {
    setEditedPlan((prev) => {
      if (!prev) return prev
      const arr = [...(prev[key] as unknown[])]
      arr.splice(index, 1)
      return { ...prev, [key]: arr }
    })
    setEditingPlanItem(null)
  }

  const addPlanItem = (key: keyof EditablePlan, blank: unknown) => {
    setEditedPlan((prev) => {
      if (!prev) return prev
      return { ...prev, [key]: [...(prev[key] as unknown[]), blank] }
    })
    // Open that section
    setExpandedPlanSections((s) => new Set(s).add(key === "measures" || key === "filters" || key === "expressions" ? "sql_expressions" : key))
  }

  const updatePlanObj = (key: keyof EditablePlan, index: number, field: string, value: string) => {
    setEditedPlan((prev) => {
      if (!prev) return prev
      const arr = [...(prev[key] as Record<string, string>[])]
      arr[index] = { ...arr[index], [field]: value }
      return { ...prev, [key]: arr }
    })
  }

  const approvePlanAndCreate = () => {
    if (!editedPlan) return
    sendMessage("計画を承認しました。スペースを作成してください。", {
      edited_plan: editedPlan,
      action: "create",
      display_name: progress.title || undefined,
    })
  }

  // ─── Plan card renderer ──────────────────────────────────────

  const renderPlanCard = (_result: Record<string, unknown>) => {
    const plan = editedPlan
    if (!plan) return null

    const sqlExpressionCount = plan.measures.length + plan.filters.length + plan.expressions.length
    const dataSourceCount = plan.tables.length + plan.metric_views.length

    const PLAN_SECTIONS: { key: string; label: string; description: string; Icon: typeof MessageSquare; count: number }[] = [
      { key: "sample_questions", label: "サンプル質問", description: "GenieスペースUIでユーザーに表示されるクリックで質問できる候補", Icon: MessageSquare, count: plan.sample_questions.length },
      { key: "text_instructions", label: "テキスト指示", description: "Genieが質問を解釈する際に参考にするビジネスルールとドメインコンテキスト", Icon: FileText, count: plan.text_instructions.trim() ? 1 : 0 },
      { key: "join_specs", label: "結合", description: "Genieがテーブル間のデータを組み合わせるためのテーブル関係", Icon: Link2, count: plan.join_specs.length },
      { key: "sql_expressions", label: "SQL式", description: "一般的な計算に使用する再利用可能なメジャー、フィルター、ディメンション", Icon: Code2, count: sqlExpressionCount },
      { key: "example_sqls", label: "SQLクエリ例", description: "Genieに正しいクエリの書き方を教える質問とSQLのペア", Icon: ListChecks, count: plan.example_sqls.length },
      { key: "benchmarks", label: "ベンチマーク質問", description: "作成後のGenie精度を評価するための期待SQLを含むテスト質問", Icon: BarChart3, count: (plan.benchmarks || []).length },
    ]

    const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
      measure: { label: "MEASURE", cls: "bg-blue-500/15 text-blue-400" },
      filter: { label: "FILTER", cls: "bg-amber-500/15 text-amber-400" },
      dimension: { label: "DIMENSION", cls: "bg-emerald-500/15 text-emerald-400" },
    }

    const taggedExpressions: { _type: string; _key: keyof EditablePlan; _idx: number; display_name?: string; alias?: string; sql?: string }[] = [
      ...plan.measures.map((m, i) => ({ ...m, _type: "measure" as const, _key: "measures" as keyof EditablePlan, _idx: i })),
      ...plan.filters.map((f, i) => ({ ...f, _type: "filter" as const, _key: "filters" as keyof EditablePlan, _idx: i })),
      ...plan.expressions.map((e, i) => ({ ...e, _type: "dimension" as const, _key: "expressions" as keyof EditablePlan, _idx: i })),
    ]

    const totalItems = plan.sample_questions.length + (plan.benchmarks || []).length + (plan.text_instructions.trim() ? 1 : 0) + plan.join_specs.length + sqlExpressionCount + plan.example_sqls.length

    const isEditing = (itemKey: string) => editingPlanItem === itemKey
    const startEdit = (itemKey: string) => setEditingPlanItem(itemKey)
    const stopEdit = () => setEditingPlanItem(null)

    return (
      <div className="mt-2 border border-default rounded-lg overflow-hidden bg-surface text-xs">
        <div className="flex items-center justify-between px-3 py-2 bg-surface-secondary border-b border-default">
          <div className="flex items-center gap-2">
            <Settings className="w-3.5 h-3.5 text-accent" />
            <span className="font-semibold text-primary">計画レビュー</span>
            <span className="text-muted">{totalItems} 項目</span>
          </div>
          <span className="text-[10px] text-muted">項目をクリックして編集</span>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-default">
          <button
            onClick={() => setPlanTab("schema")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              planTab === "schema"
                ? "text-accent border-b-2 border-accent"
                : "text-muted hover:text-primary"
            }`}
          >
            データスキーマ
            <span className="ml-1.5 text-[10px] text-muted">
              {plan.tables.length} テーブル
              {plan.metric_views.length > 0 ? ` · ${plan.metric_views.length} メトリックビュー` : ""}
            </span>
          </button>
          <button
            onClick={() => setPlanTab("instructions")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              planTab === "instructions"
                ? "text-accent border-b-2 border-accent"
                : "text-muted hover:text-primary"
            }`}
          >
            指示 & SQL
            <span className="ml-1.5 text-[10px] text-muted">{totalItems} 項目</span>
          </button>
        </div>

        {/* Data Schema tab */}
        {planTab === "schema" && (
          expandedTableId === null ? (
            <div className="divide-y divide-[var(--border-color)]">
              {plan.tables.length > 0 && plan.metric_views.length > 0 && (
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-wide bg-surface-secondary">
                  テーブル
                </div>
              )}
              {plan.tables.map((table) => {
                const includedCols = table.column_configs.filter(c => !c.excluded)
                const excludedCols = table.column_configs.filter(c => c.excluded)
                const shortName = table.identifier.split(".").pop() || table.identifier
                return (
                  <div key={table.identifier} className="px-3 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-medium text-primary text-xs">{shortName}</span>
                      <div className="flex gap-1.5">
                        <span className="text-[10px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded">{includedCols.length} プロファイル済み</span>
                        {excludedCols.length > 0 && (
                          <span className="text-[10px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded">{excludedCols.length} 除外</span>
                        )}
                      </div>
                    </div>
                    {/* Editable table description */}
                    <input
                      className="w-full text-[11px] text-muted bg-transparent border-b border-transparent hover:border-default focus:border-accent focus:outline-none py-0.5 mb-1.5"
                      value={table.description}
                      placeholder="テーブルの説明を追加..."
                      onChange={(e) => {
                        const updated = { ...plan, tables: plan.tables.map(t =>
                          t.identifier === table.identifier ? { ...t, description: e.target.value } : t
                        )}
                        setEditedPlan(updated)
                      }}
                    />
                    {/* Column name chips (first 10) */}
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {includedCols.slice(0, 10).map(c => (
                        <span key={c.column_name} className="text-[10px] bg-elevated px-1.5 py-0.5 rounded text-secondary">{c.column_name}</span>
                      ))}
                      {includedCols.length > 10 && (
                        <span className="text-[10px] text-muted">他 {includedCols.length - 10} 件</span>
                      )}
                    </div>
                    <button
                      onClick={() => setExpandedTableId(table.identifier)}
                      className="text-[11px] text-accent hover:underline"
                    >
                      カラムを編集 &rarr;
                    </button>
                  </div>
                )
              })}
              {plan.metric_views.length > 0 && (
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-wide bg-surface-secondary">
                  メトリックビュー
                </div>
              )}
              {plan.metric_views.map((metricView) => {
                const shortName = metricView.identifier.split(".").pop() || metricView.identifier
                return (
                  <div key={metricView.identifier} className="px-3 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-medium text-primary text-xs">{shortName}</span>
                      <span className="text-[10px] bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded">メトリックビュー</span>
                    </div>
                    <input
                      className="w-full text-[11px] text-muted bg-transparent border-b border-transparent hover:border-default focus:border-accent focus:outline-none py-0.5 mb-1.5"
                      value={metricView.description}
                      placeholder="メトリックビューの説明を追加..."
                      onChange={(e) => {
                        const updated = { ...plan, metric_views: plan.metric_views.map(mv =>
                          mv.identifier === metricView.identifier ? { ...mv, description: e.target.value } : mv
                        )}
                        setEditedPlan(updated)
                      }}
                    />
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {metricView.column_configs.slice(0, 10).map(c => (
                        <span key={c.column_name} className="text-[10px] bg-elevated px-1.5 py-0.5 rounded text-secondary">{c.column_name}</span>
                      ))}
                      {metricView.column_configs.length > 10 && (
                        <span className="text-[10px] text-muted">他 {metricView.column_configs.length - 10} 件</span>
                      )}
                    </div>
                  </div>
                )
              })}
              {dataSourceCount === 0 && (
                <div className="px-3 py-4 text-center text-muted text-[11px]">計画にデータソースがありません</div>
              )}
            </div>
          ) : (
            <div className="px-3 py-2">
              <button
                onClick={() => setExpandedTableId(null)}
                className="flex items-center gap-1 text-[11px] text-accent hover:underline mb-3"
              >
                <ChevronLeft className="w-3 h-3" /> テーブル一覧に戻る
              </button>
              {(() => {
                const table = plan.tables.find(t => t.identifier === expandedTableId)
                if (!table) return null
                const shortName = table.identifier.split(".").pop() || table.identifier
                return (
                  <div>
                    <div className="font-medium text-primary text-xs mb-3">{shortName}</div>
                    <div className="space-y-1">
                      {table.column_configs.map((col, ci) => (
                        <div
                          key={col.column_name}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded ${col.excluded ? "opacity-50" : ""}`}
                        >
                          {/* Include/exclude toggle */}
                          <button
                            onClick={() => {
                              const updated = { ...plan, tables: plan.tables.map(t =>
                                t.identifier === expandedTableId
                                  ? { ...t, column_configs: t.column_configs.map((c, idx) =>
                                      idx === ci ? { ...c, excluded: !c.excluded } : c
                                    )}
                                  : t
                              )}
                              setEditedPlan(updated)
                            }}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium flex-shrink-0 ${
                              col.excluded
                                ? "border-red-400/30 bg-red-500/10 text-red-400"
                                : "border-green-400/30 bg-green-500/10 text-green-400"
                            }`}
                          >
                            {col.excluded
                              ? <><X className="w-2.5 h-2.5" /> 除外済み</>
                              : <><Check className="w-2.5 h-2.5" /> 含まれる</>
                            }
                          </button>
                          {/* Column name */}
                          <span className={`text-xs font-mono w-36 flex-shrink-0 truncate ${col.excluded ? "line-through text-muted" : "text-primary"}`}>
                            {col.column_name}
                          </span>
                          {/* Type hint badge */}
                          {col.type_hint && (
                            <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1 py-0.5 rounded flex-shrink-0">
                              {col.type_hint}
                            </span>
                          )}
                          {/* Editable description */}
                          <input
                            className="flex-1 text-[11px] text-muted bg-transparent border-b border-transparent hover:border-default focus:border-accent focus:outline-none py-0.5 min-w-0"
                            value={col.description || ""}
                            placeholder={col.excluded ? "除外済み" : "説明を追加..."}
                            disabled={col.excluded}
                            onChange={(e) => {
                              const updated = { ...plan, tables: plan.tables.map(t =>
                                t.identifier === expandedTableId
                                  ? { ...t, column_configs: t.column_configs.map((c, idx) =>
                                      idx === ci ? { ...c, description: e.target.value } : c
                                    )}
                                  : t
                              )}
                              setEditedPlan(updated)
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          )
        )}

        {/* Instructions & SQL tab */}
        {planTab === "instructions" && (
        <div className="divide-y divide-[var(--border-color)]">
          {PLAN_SECTIONS.map((sec) => {
            if (sec.count === 0 && !ALWAYS_SHOW_PLAN_SECTIONS.has(sec.key)) return null
            const isOpen = expandedPlanSections.has(sec.key)
            const { Icon } = sec
            return (
              <div key={sec.key}>
                <button
                  onClick={() => togglePlanSection(sec.key)}
                  className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-elevated transition-colors text-left"
                >
                  {isOpen ? <ChevronDown className="w-3 h-3 text-muted" /> : <ChevronRight className="w-3 h-3 text-muted" />}
                  <Icon className="w-3.5 h-3.5 text-accent" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-primary block">{sec.label}</span>
                    {!isOpen && <span className="text-[10px] text-muted block truncate">{sec.description}</span>}
                  </div>
                  {sec.key === "text_instructions" ? (
                    sec.count > 0 ? <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" /> : <span className="text-[10px] text-muted flex-shrink-0">未入力</span>
                  ) : (
                    <span className="text-[10px] text-muted bg-surface-secondary px-1.5 py-0.5 rounded-full flex-shrink-0">{sec.count}</span>
                  )}
                </button>

                {isOpen && (
                  <div className="px-3 pb-3">
                    {/* Sample Questions */}
                    {sec.key === "sample_questions" && (
                      <div className="space-y-1">
                        {plan.sample_questions.map((q, i) => {
                          const itemKey = `sq-${i}`
                          return isEditing(itemKey) ? (
                            <div key={i} className="flex gap-1.5 items-start">
                              <input
                                autoFocus
                                value={q}
                                onChange={(e) => updatePlanList("sample_questions", i, e.target.value)}
                                onBlur={stopEdit}
                                onKeyDown={(e) => e.key === "Enter" && stopEdit()}
                                className="flex-1 bg-elevated border border-accent/30 rounded px-2 py-1 text-secondary focus:outline-none focus:ring-1 focus:ring-accent/40"
                              />
                              <button onMouseDown={(e) => e.preventDefault()} onClick={() => removePlanItem("sample_questions", i)} className="p-1 text-red-400 hover:text-red-300 flex-shrink-0">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div key={i} className="flex items-start gap-2 group/item py-1 cursor-pointer hover:bg-elevated rounded px-1 -mx-1" onClick={() => startEdit(itemKey)}>
                              <span className="text-muted select-none w-4 text-right flex-shrink-0">{i + 1}.</span>
                              <span className="text-secondary flex-1">{q}</span>
                              <Pencil className="w-3 h-3 text-muted opacity-0 group-hover/item:opacity-100 flex-shrink-0 mt-0.5" />
                            </div>
                          )
                        })}
                        <button
                          onClick={() => addPlanItem("sample_questions", "")}
                          className="flex items-center gap-1 text-accent hover:underline mt-1"
                        >
                          <Plus className="w-3 h-3" /> 質問を追加
                        </button>
                      </div>
                    )}

                    {/* Benchmark Questions */}
                    {sec.key === "benchmarks" && (
                      <div className="space-y-2">
                        {plan.benchmarks.map((b, i) => {
                          const itemKey = `bm-${i}`
                          return isEditing(itemKey) ? (
                            <div key={i} className="border border-accent/20 rounded-lg overflow-hidden bg-elevated">
                              <div className="flex items-center gap-1.5 px-3 py-2">
                                <input
                                  autoFocus
                                  value={b.question}
                                  onChange={(e) => updatePlanObj("benchmarks", i, "question", e.target.value)}
                                  placeholder="ベンチマーク質問"
                                  className="flex-1 bg-surface border border-default rounded px-2 py-1 text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
                                />
                                <button onClick={() => removePlanItem("benchmarks", i)} className="p-1 text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>
                              </div>
                              <textarea
                                value={b.expected_sql}
                                onChange={(e) => updatePlanObj("benchmarks", i, "expected_sql", e.target.value)}
                                rows={3}
                                className="w-full px-3 py-2 font-mono text-secondary bg-surface resize-none focus:outline-none focus:ring-1 focus:ring-accent/40"
                                placeholder="SELECT ... （期待されるSQL回答）"
                                onBlur={stopEdit}
                              />
                            </div>
                          ) : (
                            <div key={i} className="group/item cursor-pointer hover:bg-elevated rounded-lg px-2 py-1.5 -mx-1" onClick={() => startEdit(itemKey)}>
                              <div className="flex items-start gap-2">
                                <span className="text-muted select-none w-4 text-right flex-shrink-0">{i + 1}.</span>
                                <div className="flex-1 min-w-0">
                                  <span className="text-secondary block">{b.question}</span>
                                  <span className="text-muted font-mono text-[10px] block truncate mt-0.5">{b.expected_sql}</span>
                                </div>
                                <Pencil className="w-3 h-3 text-muted opacity-0 group-hover/item:opacity-100 flex-shrink-0 mt-0.5" />
                              </div>
                            </div>
                          )
                        })}
                        <button
                          onClick={() => addPlanItem("benchmarks", { question: "", expected_sql: "" })}
                          className="flex items-center gap-1 text-accent hover:underline mt-1"
                        >
                          <Plus className="w-3 h-3" /> ベンチマークを追加
                        </button>
                      </div>
                    )}

                    {/* Text Instructions — single editable block */}
                    {sec.key === "text_instructions" && (
                      <div>
                        <textarea
                          value={plan.text_instructions}
                          onChange={(e) => setEditedPlan((prev) => prev ? { ...prev, text_instructions: e.target.value } : prev)}
                          rows={Math.max(8, plan.text_instructions.split("\n").length + 2)}
                          placeholder="ビジネスルール、用語、デフォルトの前提条件、データ品質の警告..."
                          className="w-full bg-elevated border border-default rounded px-3 py-2 text-secondary text-sm font-mono leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/30"
                        />
                        <p className="text-[10px] text-muted mt-1">
                          ## ヘッダーで整理できます（用語、デフォルトの前提条件、データ品質など）
                        </p>
                      </div>
                    )}

                    {/* Joins */}
                    {sec.key === "join_specs" && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="text-muted border-b border-default">
                              <th className="px-2 py-1.5 font-medium">左テーブル</th>
                              <th className="px-2 py-1.5 font-medium">関係</th>
                              <th className="px-2 py-1.5 font-medium">右テーブル</th>
                              <th className="px-2 py-1.5 font-medium">条件</th>
                              <th className="px-2 py-1.5 w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {plan.join_specs.map((j, i) => {
                              const leftShort = (j.left_table || "").split(".").pop() || j.left_table
                              const rightShort = (j.right_table || "").split(".").pop() || j.right_table
                              const rel = j.relationship || "—"
                              return (
                                <tr key={i} className="border-b border-default last:border-0 group/join">
                                  <td className="px-2 py-1.5 font-mono text-primary">{leftShort}</td>
                                  <td className="px-2 py-1.5">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 whitespace-nowrap">{rel}</span>
                                  </td>
                                  <td className="px-2 py-1.5 font-mono text-primary">{rightShort}</td>
                                  <td className="px-2 py-1.5 font-mono text-secondary">
                                    {leftShort}.{j.left_column} = {rightShort}.{j.right_column}
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <button onClick={() => removePlanItem("join_specs", i)} className="p-1 text-red-400 hover:text-red-300 opacity-0 group-hover/join:opacity-100 transition-opacity">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* SQL Expressions */}
                    {sec.key === "sql_expressions" && (
                      <div className="space-y-1">
                        {taggedExpressions.map((expr, i) => {
                          const badge = TYPE_BADGE[expr._type] || TYPE_BADGE.dimension
                          const itemKey = `expr-${expr._key}-${expr._idx}`
                          const name = expr.display_name || expr.alias || ""
                          const sql = expr.sql || ""
                          return isEditing(itemKey) ? (
                            <div key={i} className="flex gap-1.5 items-start border border-accent/20 rounded p-2 bg-elevated">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.cls} flex-shrink-0 mt-0.5`}>
                                {badge.label}
                              </span>
                              <div className="flex-1 space-y-1">
                                <input
                                  autoFocus
                                  value={name}
                                  onChange={(e) => updatePlanObj(expr._key, expr._idx, expr.display_name !== undefined ? "display_name" : "alias", e.target.value)}
                                  placeholder="名前"
                                  className="w-full bg-surface border border-default rounded px-2 py-1 text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
                                />
                                <input
                                  value={sql}
                                  onChange={(e) => updatePlanObj(expr._key, expr._idx, "sql", e.target.value)}
                                  placeholder="SQL式"
                                  className="w-full bg-surface border border-default rounded px-2 py-1 font-mono text-secondary focus:outline-none focus:ring-1 focus:ring-accent/40"
                                />
                              </div>
                              <div className="flex flex-col gap-1 flex-shrink-0">
                                <button onClick={stopEdit} className="p-1 text-accent hover:text-accent/80"><Check className="w-3 h-3" /></button>
                                <button onClick={() => removePlanItem(expr._key, expr._idx)} className="p-1 text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>
                              </div>
                            </div>
                          ) : (
                            <div key={i} className="flex items-center gap-2 group/item py-1 cursor-pointer hover:bg-elevated rounded px-1 -mx-1" onClick={() => startEdit(itemKey)}>
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.cls} flex-shrink-0`}>
                                {badge.label}
                              </span>
                              <span className="text-primary font-medium">{name || "—"}</span>
                              <span className="font-mono text-secondary flex-1 truncate" title={sql}>{sql}</span>
                              <Pencil className="w-3 h-3 text-muted opacity-0 group-hover/item:opacity-100 flex-shrink-0" />
                            </div>
                          )
                        })}
                        <div className="flex gap-2 mt-1">
                          <button onClick={() => addPlanItem("measures", { display_name: "", sql: "" })} className="flex items-center gap-1 text-accent hover:underline">
                            <Plus className="w-3 h-3" /> メジャー
                          </button>
                          <button onClick={() => addPlanItem("filters", { display_name: "", sql: "" })} className="flex items-center gap-1 text-accent hover:underline">
                            <Plus className="w-3 h-3" /> フィルター
                          </button>
                          <button onClick={() => addPlanItem("expressions", { display_name: "", sql: "" })} className="flex items-center gap-1 text-accent hover:underline">
                            <Plus className="w-3 h-3" /> ディメンション
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Example SQL Queries */}
                    {sec.key === "example_sqls" && (
                      <div className="space-y-2">
                        {plan.example_sqls.map((ex, i) => {
                          const itemKey = `exsql-${i}`
                          return isEditing(itemKey) ? (
                            <div key={i} className="border border-accent/20 rounded-lg overflow-hidden bg-elevated">
                              <div className="px-3 py-2 flex gap-1.5 items-center border-b border-default">
                                <span className="text-muted text-[10px] flex-shrink-0">{i + 1}.</span>
                                <input
                                  autoFocus
                                  value={ex.question}
                                  onChange={(e) => updatePlanObj("example_sqls", i, "question", e.target.value)}
                                  placeholder="質問"
                                  className="flex-1 bg-surface border border-default rounded px-2 py-1 text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
                                />
                                <button onClick={stopEdit} className="p-1 text-accent hover:text-accent/80"><Check className="w-3 h-3" /></button>
                                <button onClick={() => removePlanItem("example_sqls", i)} className="p-1 text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>
                              </div>
                              <textarea
                                value={ex.sql}
                                onChange={(e) => updatePlanObj("example_sqls", i, "sql", e.target.value)}
                                rows={4}
                                className="w-full px-3 py-2 font-mono text-secondary bg-surface resize-none focus:outline-none focus:ring-1 focus:ring-accent/40"
                                placeholder="SELECT ..."
                              />
                            </div>
                          ) : (
                            <div key={i} className="border border-default rounded-lg overflow-hidden group/item cursor-pointer hover:border-accent/30 transition-colors" onClick={() => startEdit(itemKey)}>
                              <div className="px-3 py-2 bg-surface-secondary text-primary font-medium flex items-center">
                                <span className="flex-1">{i + 1}. {ex.question}</span>
                                <Pencil className="w-3 h-3 text-muted opacity-0 group-hover/item:opacity-100 flex-shrink-0" />
                              </div>
                              <pre className="px-3 py-2 font-mono text-secondary whitespace-pre-wrap break-words bg-surface max-h-32 overflow-auto">
                                {ex.sql}
                              </pre>
                            </div>
                          )
                        })}
                        <button
                          onClick={() => addPlanItem("example_sqls", { question: "", sql: "" })}
                          className="flex items-center gap-1 text-accent hover:underline mt-1"
                        >
                          <Plus className="w-3 h-3" /> SQLクエリ例を追加
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        )}

        {/* Action buttons footer */}
        <div className="px-3 py-2.5 bg-surface-secondary border-t border-default flex flex-wrap items-center gap-2">
          <button
            onClick={approvePlanAndCreate}
            disabled={isStreaming}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-md text-[11px] font-semibold hover:bg-emerald-500 transition-colors disabled:opacity-40"
          >
            <Rocket className="w-3 h-3" />
            承認して作成
          </button>
        </div>
      </div>
    )
  }

  const renderTestSqlCard = (result: Record<string, unknown>) => {
    const sql = result.sql as string || ""
    const rawCols = result.columns as (string | { name: string })[] || []
    const colNames = rawCols.map((c) => (typeof c === "string" ? c : c?.name ?? ""))
    const sampleRows = result.sample_rows as unknown[][] || []
    const rowCount = result.row_count as number || 0

    return (
      <div className="ml-5 mt-1 text-xs border border-default rounded-lg overflow-hidden bg-surface">
        <div className="px-3 py-2 bg-surface-secondary border-b border-default">
          <pre className="font-mono text-[11px] text-secondary whitespace-pre-wrap break-words">{sql}</pre>
        </div>
        {colNames.length > 0 && sampleRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-default bg-elevated/50">
                  {colNames.map((c, ci) => (
                    <th key={ci} className="px-2 py-1 text-left font-semibold text-primary whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleRows.slice(0, 3).map((row, ri) => (
                  <tr key={ri} className="border-b border-default last:border-0">
                    {(row as unknown[]).map((cell, ci) => (
                      <td key={ci} className="px-2 py-1 text-muted whitespace-nowrap max-w-[200px] truncate">
                        {cell == null ? <span className="italic text-muted/50">null</span> : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-3 py-1.5 text-[10px] text-muted border-t border-default">
          {rowCount} 行を返却 · {colNames.length} カラム
        </div>
      </div>
    )
  }

  const hasRichCard = (msg: AgentChatMessage): boolean =>
    !!msg.tool_result && !msg.tool_result.error && (msg.tool_name === "describe_table" || msg.tool_name === "profile_columns" || msg.tool_name === "present_plan" || msg.tool_name === "generate_plan" || msg.tool_name === "test_sql" || msg.tool_name === "assess_data_quality" || msg.tool_name === "profile_table_usage")

  const getToolSummary = (msg: AgentChatMessage): string | null => {
    if (!msg.tool_result || msg.tool_result.error) return null
    const r = msg.tool_result as Record<string, unknown>
    if (msg.tool_name === "describe_table") {
      const table = (r.table as string)?.split(".").pop() || ""
      const cols = (r.columns as unknown[])?.length ?? 0
      return `${table} — ${cols} カラム`
    }
    if (msg.tool_name === "profile_columns") {
      const table = (r.table as string)?.split(".").pop() || ""
      const profiles = r.profiles as Record<string, unknown> | undefined
      const profiled = profiles ? Object.keys(profiles).length : 0
      return `${table} — ${profiled} プロファイル済み`
    }
    if (msg.tool_name === "test_sql") {
      const cols = (r.columns as unknown[])?.length ?? 0
      const rows = (r.row_count as number) ?? 0
      return `${cols} カラム · ${rows} 行`
    }
    if (msg.tool_name === "assess_data_quality") {
      const summary = r.summary as { tables_assessed?: number; total_recommended_excludes?: number; total_recommended_review?: number } | undefined
      if (summary) {
        const parts: string[] = [`${summary.tables_assessed ?? 0} テーブル`]
        if (summary.total_recommended_excludes) parts.push(`${summary.total_recommended_excludes} 非表示推奨`)
        if (summary.total_recommended_review) parts.push(`${summary.total_recommended_review} 要確認`)
        return parts.join(" · ")
      }
    }
    if (msg.tool_name === "profile_table_usage") {
      const usageSummary = r.summary as { tables_with_lineage?: number; recent_query_count?: number } | undefined
      if (usageSummary) {
        const parts: string[] = []
        if (usageSummary.tables_with_lineage) parts.push(`${usageSummary.tables_with_lineage} リネージあり`)
        if (usageSummary.recent_query_count) parts.push(`${usageSummary.recent_query_count} 最近のクエリ`)
        return parts.length ? parts.join(" · ") : "no usage data"
      }
      if (r.system_tables_available === false) return "システムテーブル利用不可"
    }
    return null
  }

  const renderToolCall = (msg: AgentChatMessage) => {
    if ((msg.tool_name === "present_plan" || msg.tool_name === "generate_plan") && msg.tool_result && !msg.tool_result.error) {
      // Only render the plan card for the LAST generate_plan/present_plan in messages
      // to avoid showing duplicate plans when the tool is called multiple times.
      const lastPlanMsg = [...messages].reverse().find(
        (m) => m.role === "tool" && (m.tool_name === "present_plan" || m.tool_name === "generate_plan") && m.tool_result && !m.tool_result.error,
      )
      if (lastPlanMsg && msg.id !== lastPlanMsg.id) {
        return null // Skip earlier plan cards
      }
      return <div key={msg.id} className="mx-4 my-2">{renderPlanCard(msg.tool_result)}</div>
    }
    const isExpanded = expandedTools.has(msg.id)
    const isDone = !!msg.tool_result
    const hasError = isDone && !!msg.tool_result?.error
    const rich = hasRichCard(msg)
    const summary = !isExpanded && isDone ? getToolSummary(msg) : null

    return (
      <div key={msg.id} className="mx-12 my-1">
        <button
          onClick={() => toggleTool(msg.id)}
          className="flex items-center gap-2 text-xs text-muted hover:text-secondary transition-colors group w-full"
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          <Wrench className="w-3 h-3" />
          <span className="font-medium">{msg.content}</span>
          {summary && <span className="text-secondary/60">· {summary}</span>}
          {!isDone && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
          {isDone && !hasError && <Check className="w-3 h-3 text-emerald-500 ml-1" />}
          {hasError && <AlertCircle className="w-3 h-3 text-red-400 ml-1" />}
          {rich && !isExpanded && isDone && !summary && (
            <span className="ml-1 text-accent text-[10px]">クリックで表示</span>
          )}
        </button>
        {isExpanded && msg.tool_result && (
          rich ? (
            msg.tool_name === "describe_table"
              ? renderDescribeCard(msg.tool_result)
              : (msg.tool_name === "present_plan" || msg.tool_name === "generate_plan")
                ? renderPlanCard(msg.tool_result)
                : msg.tool_name === "test_sql"
                  ? renderTestSqlCard(msg.tool_result)
                  : msg.tool_name === "assess_data_quality"
                    ? renderQualityCard(msg.tool_result)
                    : msg.tool_name === "profile_table_usage"
                      ? renderUsageCard(msg.tool_result)
                      : renderProfileCard(msg.tool_result)
          ) : (
            <div className="ml-5 mt-1 text-xs bg-surface-secondary rounded-lg p-3 max-h-48 overflow-auto">
              <pre className="font-mono text-secondary whitespace-pre-wrap break-words">
                {JSON.stringify(msg.tool_result, null, 2)}
              </pre>
            </div>
          )
        )}
      </div>
    )
  }

  const renderInspectionGroup = (group: { msgs: AgentChatMessage[]; id: string }) => {
    const isExpanded = expandedTools.has(group.id)
    const allDone = group.msgs.every((m) => !!m.tool_result)
    const anyError = group.msgs.some((m) => !!m.tool_result?.error)

    const tables = new Set<string>()
    let totalCols = 0
    let totalProfiled = 0
    let qualityIssues = 0
    let lineageCount = 0

    for (const m of group.msgs) {
      if (!m.tool_result) continue
      const r = m.tool_result as Record<string, unknown>
      const table = (r.table as string)?.split(".").pop() || ""
      if (table) tables.add(table)
      if (m.tool_name === "describe_table") totalCols += (r.columns as unknown[])?.length ?? 0
      if (m.tool_name === "profile_columns") {
        const profiles = r.profiles as Record<string, unknown> | undefined
        totalProfiled += profiles ? Object.keys(profiles).length : 0
      }
      if (m.tool_name === "assess_data_quality") {
        const qt = r.tables as Record<string, unknown> | undefined
        if (qt) Object.keys(qt).forEach((t) => tables.add(t.split(".").pop() || t))
        const qs = r.summary as { total_recommended_excludes?: number; total_recommended_review?: number } | undefined
        qualityIssues += (qs?.total_recommended_excludes ?? 0) + (qs?.total_recommended_review ?? 0)
      }
      if (m.tool_name === "profile_table_usage") {
        const us = r.summary as { tables_with_lineage?: number } | undefined
        if (us?.tables_with_lineage) lineageCount += us.tables_with_lineage
      }
    }

    const summaryParts: string[] = []
    summaryParts.push(`${tables.size} テーブル`)
    if (totalCols) summaryParts.push(`${totalCols} カラム`)
    if (totalProfiled) summaryParts.push(`${totalProfiled} プロファイル済み`)
    if (qualityIssues) summaryParts.push(`${qualityIssues} 品質問題`)
    if (lineageCount) summaryParts.push(`${lineageCount} リネージあり`)
    const summary = allDone ? summaryParts.join(" · ") : `${group.msgs.length} 操作`

    return (
      <div key={group.id} className="mx-12 my-1">
        <button
          onClick={() => toggleTool(group.id)}
          className="flex items-center gap-2 text-xs text-muted hover:text-secondary transition-colors group w-full"
        >
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <Search className="w-3 h-3" />
          <span className="font-medium">データ検査</span>
          <span className="text-secondary/60">· {summary}</span>
          {!allDone && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
          {allDone && !anyError && <Check className="w-3 h-3 text-emerald-500 ml-1" />}
          {anyError && <AlertCircle className="w-3 h-3 text-red-400 ml-1" />}
        </button>
        {isExpanded && (
          <div className="ml-2 mt-1 border-l border-default pl-2 space-y-0.5">
            {group.msgs.map((m) => renderToolCall(m))}
          </div>
        )}
      </div>
    )
  }

  const isElementSuperseded = (elId: string): boolean => {
    if (elId === "catalog_selection") return progress.schemas.length > 0
    if (elId === "schema_selection") return progress.tables.length > 0
    if (elId === "table_selection") return progress.inspectionDone
    if (elId === "warehouse_selection") return progress.configReady
    return false
  }

  const isLatestAssistantMsg = (msgId: string): boolean => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && !messages[i].is_thinking) {
        return messages[i].id === msgId
      }
    }
    return false
  }

  const renderUIElements = (msgId: string, elements: AgentUIElement[]) => {
    const isLatest = isLatestAssistantMsg(msgId)
    return elements.map((el) => {
      if (!isLatest && isElementSuperseded(el.id)) return null
      const key = `${msgId}:${el.id}`
      const isUsed = usedElements.has(key)
      const Icon = ELEMENT_ICONS[el.id] || Database

      if (el.type === "single_select" && el.options && el.options.length > 0) {
        const useLargeList = el.options.length > COMBOBOX_THRESHOLD && !isUsed
        const searchTerm = elementSearch[key] || ""
        const filtered = useLargeList
          ? el.options.filter((o) => {
              const q = searchTerm.toLowerCase()
              return o.label.toLowerCase().includes(q) || (o.description || "").toLowerCase().includes(q)
            })
          : el.options

        return (
          <div key={el.id} className="mt-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Icon className="w-3.5 h-3.5 text-muted" />
              <span className="text-xs font-medium text-muted uppercase tracking-wide">
                {el.label || "一つ選択"}
              </span>
              {useLargeList && (
                <span className="text-[10px] text-muted ml-auto">
                  {searchTerm ? `${filtered.length} / ` : ""}{el.options.length} 項目
                </span>
              )}
              {isUsed && <Check className="w-3 h-3 text-emerald-500 ml-1" />}
            </div>

            {useLargeList ? (
              <div className="border border-default rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-default bg-surface-secondary">
                  <Search className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setElementSearch((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={`${el.label || "オプション"}を検索...`}
                    className="flex-1 text-xs bg-transparent text-primary placeholder:text-muted focus:outline-none"
                    autoFocus
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setElementSearch((prev) => ({ ...prev, [key]: "" }))}
                      className="text-muted hover:text-secondary"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-[var(--border-color)]">
                  {filtered.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-muted text-center">
                      「{searchTerm}」に一致するものはありません
                    </div>
                  ) : (
                    filtered.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleSingleSelect(msgId, el, opt)}
                        disabled={isStreaming}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-elevated transition-colors"
                      >
                        <span className="font-mono text-primary">{opt.label}</span>
                        {opt.description && (
                          <span className="text-[10px] text-muted block truncate mt-0.5">
                            {opt.description}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {el.options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleSingleSelect(msgId, el, opt)}
                    disabled={isUsed || isStreaming}
                    className={`group relative px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      isUsed
                        ? "border-default bg-surface-secondary text-muted cursor-default opacity-60"
                        : "border-accent/30 bg-accent/5 text-accent hover:bg-accent/15 hover:border-accent/50 cursor-pointer"
                    }`}
                  >
                    {opt.label}
                    {opt.description && (
                      <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 text-[10px] text-white bg-gray-900 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                        {opt.description.slice(0, 80)}
                        {opt.description.length > 80 ? "..." : ""}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {!isUsed && (
              <div className="mt-2">
                <button
                  onClick={() => {
                    setUsedElements((prev) => new Set(prev).add(key))
                    sendMessage("わかりません — 探索して最適なオプションを推奨してください。")
                  }}
                  disabled={isStreaming}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-default text-muted hover:text-secondary hover:border-accent/30 transition-all cursor-pointer"
                >
                  わからない場合はAIに探索させる
                </button>
              </div>
            )}
          </div>
        )
      }

      if (el.type === "multi_select" && el.id === "table_selection") {
        return null
      }

      if (el.type === "multi_select" && el.options && el.options.length > 0) {
        const selected = multiSelections[key] || new Set<string>()
        const useLargeMulti = el.options.length > COMBOBOX_THRESHOLD
        const multiSearch = elementSearch[key] || ""
        const filteredOpts = useLargeMulti && multiSearch
          ? el.options.filter((o) => {
              const q = multiSearch.toLowerCase()
              return o.label.toLowerCase().includes(q) || (o.description || "").toLowerCase().includes(q)
            })
          : el.options
        const filteredValues = filteredOpts.map((o) => o.value)
        const allFilteredSelected = filteredValues.length > 0 && filteredValues.every((v) => selected.has(v))

        const toggleAll = () => {
          setMultiSelections((prev) => {
            if (allFilteredSelected) {
              const next = new Set(selected)
              filteredValues.forEach((v) => next.delete(v))
              return { ...prev, [key]: next }
            }
            return { ...prev, [key]: new Set([...selected, ...filteredValues]) }
          })
        }

        return (
          <div key={el.id} className="mt-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Icon className="w-3.5 h-3.5 text-muted" />
              <span className="text-xs font-medium text-muted uppercase tracking-wide">
                {el.label || "テーブルを選択"}
              </span>
              {!isUsed && selected.size > 0 && (
                <span className="text-xs text-accent ml-1">{selected.size} 選択済み</span>
              )}
              {isUsed && <Check className="w-3 h-3 text-emerald-500 ml-1" />}
              {!isUsed && filteredOpts.length > 2 && (
                <button
                  onClick={toggleAll}
                  disabled={isStreaming}
                  className="ml-auto text-[10px] text-accent hover:underline disabled:opacity-40"
                >
                  {allFilteredSelected ? "すべて解除" : `すべて選択${multiSearch ? "（フィルター済み）" : ""}`}
                </button>
              )}
            </div>

            {/* Selected chips (large lists only) */}
            {useLargeMulti && !isUsed && selected.size > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {Array.from(selected).map((v) => {
                  const opt = el.options!.find((o) => o.value === v)
                  return (
                    <span
                      key={v}
                      className="inline-flex items-center gap-0.5 pl-1.5 pr-1 py-0.5 bg-accent/10 text-accent text-[10px] rounded font-mono"
                    >
                      {opt?.label || v.split(".").pop()}
                      <button onClick={() => toggleMultiOption(key, v)} disabled={isStreaming}>
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  )
                })}
              </div>
            )}

            <div className={`border border-default rounded-lg overflow-hidden ${isUsed ? "opacity-60" : ""}`}>
              {/* Search input for large lists */}
              {useLargeMulti && !isUsed && (
                <div className="flex items-center gap-2 px-3 py-2 border-b border-default bg-surface-secondary">
                  <Search className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                  <input
                    type="text"
                    value={multiSearch}
                    onChange={(e) => setElementSearch((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={`${el.options.length} テーブルを検索...`}
                    className="flex-1 text-xs bg-transparent text-primary placeholder:text-muted focus:outline-none"
                  />
                  {multiSearch && (
                    <button
                      onClick={() => setElementSearch((prev) => ({ ...prev, [key]: "" }))}
                      className="text-muted hover:text-secondary"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  <span className="text-[10px] text-muted flex-shrink-0">
                    {multiSearch ? `${filteredOpts.length} / ${el.options.length}` : `${el.options.length} テーブル`}
                  </span>
                </div>
              )}

              <div className="divide-y divide-[var(--border-color)] max-h-52 overflow-y-auto">
                {filteredOpts.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted text-center">
                    「{multiSearch}」に一致するものはありません
                  </div>
                ) : (
                  filteredOpts.map((opt) => {
                    const checked = selected.has(opt.value)
                    return (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-3 px-3 py-2 text-xs transition-colors ${
                          isUsed ? "cursor-default" : "cursor-pointer hover:bg-elevated"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMultiOption(key, opt.value)}
                          disabled={isUsed || isStreaming}
                          className="w-3.5 h-3.5 shrink-0 accent-[var(--color-accent)]"
                        />
                        <div className="min-w-0 flex-1">
                          <span
                            className={`font-mono block truncate ${checked ? "text-primary font-medium" : "text-secondary"}`}
                          >
                            {opt.label}
                          </span>
                          {opt.description && (
                            <span className="text-[10px] text-muted block truncate">
                              {opt.description}
                            </span>
                          )}
                        </div>
                      </label>
                    )
                  })
                )}
              </div>
            </div>
            {!isUsed && (
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => confirmMultiSelect(msgId, el)}
                  disabled={selected.size === 0 || isStreaming}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium disabled:opacity-40 hover:bg-accent/90 transition-colors"
                >
                  <Check className="w-3 h-3" />
                  選択を確定 ({selected.size})
                </button>
                <button
                  onClick={() => {
                    setUsedElements((prev) => new Set(prev).add(key))
                    sendMessage("どのテーブルを選べばよいかわかりません — 私のユースケースに最適なものを推奨してください。")
                  }}
                  disabled={isStreaming}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-default text-muted hover:text-secondary hover:border-accent/30 transition-colors"
                >
                  わからない場合はAIに選択させる
                </button>
              </div>
            )}
          </div>
        )
      }

      if (el.type === "config_preview" && el.config) {
        return (
          <div key={el.id} className="mt-3 border border-default rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-surface-secondary border-b border-default">
              <span className="text-xs font-medium text-secondary">
                {el.label || "設定プレビュー"}
              </span>
              <button
                onClick={() => handleCopyConfig(el.config!)}
                className="flex items-center gap-1 text-xs text-muted hover:text-secondary transition-colors"
              >
                {copiedConfig ? (
                  <>
                    <CheckCheck className="w-3 h-3 text-emerald-500" /> コピーしました
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" /> JSONをコピー
                  </>
                )}
              </button>
            </div>
            <pre className="text-xs font-mono p-3 max-h-64 overflow-auto text-secondary">
              {JSON.stringify(el.config, null, 2)}
            </pre>
          </div>
        )
      }

      return null
    })
  }

  const renderCreatedBanner = (space: {
    space_id: string
    url: string
    display_name: string
  }) => (
    <div className="mx-4 my-4">
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <Check className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">スペースが作成されました</p>
            <p className="text-xs text-muted">{space.display_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={space.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent/90 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Genieスペースを開く
          </a>
          <button
            onClick={() => onCreated(space.space_id, space.display_name, space.url)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-default text-secondary rounded-lg text-xs font-medium hover:bg-elevated transition-colors"
          >
            スペースを診断
          </button>
        </div>
      </div>
    </div>
  )

  const renderUpdatedBanner = (space: { space_id: string; url: string }) => (
    <div className="mx-4 my-4">
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <Check className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">スペースが更新されました</p>
            <p className="text-xs text-muted">修正が正常に適用されました</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={space.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent/90 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Genieスペースを開く
          </a>
          <button
            onClick={() => onCreated(space.space_id, "", space.url, "score")}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-default text-secondary rounded-lg text-xs font-medium hover:bg-elevated transition-colors"
          >
            <BarChart3 className="w-3 h-3" />
            IQスコアを再スキャン
          </button>
        </div>
      </div>
    </div>
  )

  const renderMessage = (msg: AgentChatMessage) => {
    if (msg.role === "tool") return renderToolCall(msg)
    if (msg.created_space) return renderCreatedBanner(msg.created_space)
    if (msg.updated_space) return renderUpdatedBanner(msg.updated_space)
    if (msg.role === "user") {
      return (
        <div key={msg.id} className="flex items-start gap-3 mx-4 my-3 justify-end">
          <div className="max-w-[80%] bg-accent/10 rounded-xl rounded-tr-sm px-4 py-2.5">
            <p className="text-sm text-primary whitespace-pre-wrap">{msg.content}</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-surface-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
            <User className="w-4 h-4 text-muted" />
          </div>
        </div>
      )
    }

    if (msg.is_error) {
      return (
        <div key={msg.id} className="mx-4 my-3">
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-red-500/10 border border-red-500/25 rounded-xl">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-red-400 mb-0.5">エラーが発生しました</p>
              <p className="text-xs text-red-300/80 break-words">{msg.content}</p>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div key={msg.id} className="flex items-start gap-3 mx-4 my-3">
        <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-accent" />
        </div>
        <div className="max-w-[85%] min-w-0">
          <div className="prose prose-chat max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
          {msg.ui_elements && msg.ui_elements.length > 0 && renderUIElements(msg.id, msg.ui_elements)}
        </div>
      </div>
    )
  }


  // ─── Progress panel ───────────────────────────────────────────

  const step = currentStep(progress)

  const renderPanel = () => (
    <aside className="w-72 xl:w-80 flex-shrink-0 border border-default rounded-xl bg-surface overflow-hidden flex flex-col">
      {/* Panel header */}
      <div className="px-4 py-3 border-b border-default">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-primary uppercase tracking-wide">
            {fixMode ? "修正の進捗" : "構築の進捗"}
          </span>
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              disabled={isStreaming}
              className="flex items-center gap-1 text-[10px] text-muted hover:text-red-400 transition-colors disabled:opacity-40"
              title="やり直す — すべてをクリアします"
            >
              <RotateCcw className="w-3 h-3" />
              やり直す
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {/* Steps — fix mode vs create mode */}
        {fixMode ? FIX_STEPS.map((s, i) => {
          const done = i < fixStep
          const active = i === fixStep && fixStep < 3
          const { Icon } = s

          return (
            <div key={s.key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    done
                      ? "bg-emerald-500/20 text-emerald-500"
                      : active
                        ? "bg-accent/15 text-accent ring-2 ring-accent/40"
                        : "bg-elevated text-muted"
                  }`}
                >
                  {done ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                </div>
                {i < FIX_STEPS.length - 1 && (
                  <div className={`w-px flex-1 min-h-4 my-0.5 ${done ? "bg-emerald-500/40" : "bg-[var(--border-color)]"}`} />
                )}
              </div>
              <div className="pb-3 flex-1 min-w-0">
                <span className={`text-xs font-medium ${done ? "text-emerald-500" : active ? "text-accent" : "text-muted"}`}>
                  {s.label}
                </span>
              </div>
            </div>
          )
        }) : STEPS.map((s, i) => {
          const done = i < step
          const active = i === step
          const canBacktrack = done && !isStreaming && !!s.backtrackMsg
          const { Icon } = s

          return (
            <div key={s.key} className="flex gap-3">
              {/* Vertical line + dot */}
              <div className="flex flex-col items-center">
                <div
                  onClick={canBacktrack ? () => sendMessage(s.backtrackMsg) : undefined}
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    done
                      ? "bg-emerald-500/20 text-emerald-500"
                      : active
                        ? "bg-accent/15 text-accent ring-2 ring-accent/40"
                        : "bg-elevated text-muted"
                  } ${canBacktrack ? "cursor-pointer hover:ring-2 hover:ring-emerald-500/40 transition-all" : ""}`}
                >
                  {done ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`w-px flex-1 min-h-4 my-0.5 ${done ? "bg-emerald-500/40" : "bg-[var(--border-color)]"}`}
                  />
                )}
              </div>

              {/* Step content */}
              <div className="pb-3 flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    onClick={canBacktrack ? () => sendMessage(s.backtrackMsg) : undefined}
                    className={`text-xs font-medium ${
                      done
                        ? "text-emerald-500"
                        : active
                          ? "text-accent"
                          : "text-muted"
                    } ${canBacktrack ? "cursor-pointer hover:underline" : ""}`}
                    title={canBacktrack ? "クリックしてこのステップに戻る" : undefined}
                  >
                    {s.label}
                  </span>
                </div>

                {/* Step-specific details */}
                {s.key === "requirements" && (
                  <div className="mt-1 space-y-1.5">
                    {editingTitle ? (
                      <div className="flex gap-1">
                        <input
                          value={titleDraft}
                          onChange={(e) => setTitleDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitTitle()
                            if (e.key === "Escape") setEditingTitle(false)
                          }}
                          autoFocus
                          placeholder="スペース名"
                          className="flex-1 text-xs border border-accent/40 rounded px-2 py-1 bg-surface text-primary focus:outline-none"
                        />
                        <button
                          onClick={submitTitle}
                          disabled={!titleDraft.trim() || isStreaming}
                          className="px-1.5 text-accent disabled:opacity-40"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    ) : progress.title ? (
                      <button
                        onClick={() => {
                          setTitleDraft(progress.title)
                          setEditingTitle(true)
                        }}
                        className="group flex items-center gap-1 text-xs text-secondary hover:text-primary transition-colors"
                      >
                        <span className="truncate">{progress.title}</span>
                        <Pencil className="w-2.5 h-2.5 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ) : active ? (
                      <button
                        onClick={() => setEditingTitle(true)}
                        className="text-[10px] text-accent hover:underline mt-0.5"
                      >
                        + 名前を設定
                      </button>
                    ) : null}
                  </div>
                )}

                {s.key === "discovery" && (progress.catalog || progress.tables.length > 0) && (
                  <div className="mt-1 space-y-1">
                    {progress.catalog && (
                      <span className="text-[10px] text-muted font-mono block truncate">
                        {progress.schemas.length > 0
                          ? progress.schemas.map((s) => s.includes(".") ? s : `${progress.catalog}.${s}`).join(", ")
                          : progress.catalog}
                      </span>
                    )}
                    {progress.tables.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {progress.tables.map((t) => {
                          const short = t.split(".").pop() || t
                          return (
                            <span
                              key={t}
                              className="group inline-flex items-center gap-0.5 pl-1.5 pr-1 py-0.5 bg-accent/10 text-accent text-[10px] rounded font-mono"
                            >
                              {short}
                              <button
                                onClick={() => removeTable(t)}
                                disabled={isStreaming}
                                className="opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {s.key === "inspection" && progress.inspectionDone && (
                  <div className="mt-1">
                    {(() => {
                      const is = progress.inspectionSummary
                      const parts: string[] = []
                      if (is.columnsProfiled > 0) parts.push(`${is.columnsProfiled} カラムをプロファイル済み`)
                      if (is.qualityIssues > 0) parts.push(`${is.qualityIssues} 品質問題`)
                      if (is.lineageCount > 0) parts.push(`${is.lineageCount} テーブルにリネージあり`)
                      return parts.length > 0 ? (
                        <p className="text-[10px] text-muted">{parts.join(" · ")}</p>
                      ) : (
                        <p className="text-[10px] text-muted">検査完了</p>
                      )
                    })()}
                  </div>
                )}

                {s.key === "profiling" && progress.profilingDone && (
                  <div className="mt-1">
                    {(() => {
                      const ps = progress.profilingSummary
                      const parts: string[] = []
                      if (ps.overall) parts.push(`全体: ${ps.overall}`)
                      if (ps.questionsAssessed > 0) parts.push(`${ps.questionsAssessed} 質問を評価済み`)
                      if (ps.lowConfidence > 0) parts.push(`${ps.lowConfidence} 低信頼度`)
                      return parts.length > 0 ? (
                        <p className="text-[10px] text-muted">{parts.join(" · ")}</p>
                      ) : (
                        <p className="text-[10px] text-muted">プロファイリング完了</p>
                      )
                    })()}
                  </div>
                )}

                {s.key === "plan" && progress.planReady && (
                  <div className="mt-1">
                    {(() => {
                      const ps = progress.planSummary
                      const parts: string[] = []
                      if (ps.questions > 0) parts.push(`${ps.questions} 質問`)
                      if (ps.benchmarks > 0) parts.push(`${ps.benchmarks} ベンチマーク`)
                      if (ps.measures > 0) parts.push(`${ps.measures} メジャー`)
                      if (ps.joins > 0) parts.push(`${ps.joins} 結合`)
                      if (ps.exampleSqls > 0) parts.push(`${ps.exampleSqls} SQL例`)
                      if (ps.filters > 0) parts.push(`${ps.filters} フィルター`)
                      if (ps.textInstruction) parts.push("テキスト指示")
                      return parts.length > 0 ? (
                        <p className="text-[10px] text-muted">{parts.join(", ")}</p>
                      ) : null
                    })()}
                  </div>
                )}

                {s.key === "config" && progress.configReady && progress.config && (
                  <div className="mt-1">
                    <button
                      onClick={() => handleCopyConfig(progress.config!)}
                      className="flex items-center gap-1 text-[10px] text-accent hover:underline"
                    >
                      <Copy className="w-2.5 h-2.5" />
                      JSONをコピー
                    </button>
                  </div>
                )}

                {s.key === "create" && progress.spaceId && (
                  <div className="mt-1">
                    <a
                      href={progress.spaceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-[10px] text-accent hover:underline"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      スペースを開く
                    </a>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* テーブルを参照 button */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="mx-4 mb-2 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-accent bg-accent/5 border border-accent/20 rounded-lg hover:bg-accent/10 transition-colors"
      >
        <Database className="w-3 h-3" />
        テーブルを参照
        {progress.tables.length > 0 && (
          <span className="ml-1 bg-accent/20 text-accent text-[10px] px-1.5 py-0.5 rounded-full">
            {progress.tables.length}
          </span>
        )}
      </button>

      {/* Panel footer — space links */}
      {fixMode && fixResult ? (
        <div className="border-t border-default px-4 py-3 flex gap-2">
          <a
            href={fixResult.url}
            target="_blank"
            rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-accent bg-accent/5 border border-accent/20 rounded-lg hover:bg-accent/10 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            スペースを開く
          </a>
          <button
            onClick={() => onCreated(fixResult.spaceId, "", fixResult.url, "score")}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-secondary border border-default rounded-lg hover:bg-elevated transition-colors"
          >
            <BarChart3 className="w-3 h-3" />
            再スキャン
          </button>
        </div>
      ) : progress.spaceId && progress.spaceUrl ? (
        <div className="border-t border-default px-4 py-3 flex gap-2">
          <a
            href={progress.spaceUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-accent bg-accent/5 border border-accent/20 rounded-lg hover:bg-accent/10 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            スペースを開く
          </a>
          <button
            onClick={() => onCreated(progress.spaceId, progress.spaceDisplayName, progress.spaceUrl)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-secondary border border-default rounded-lg hover:bg-elevated transition-colors"
          >
            スペースを診断
          </button>
        </div>
      ) : null}
    </aside>
  )

  // ─── Main layout ──────────────────────────────────────────────

  return (
    <div className="flex gap-4 h-[calc(100vh-13rem)]">
      {/* Chat column */}
      <div className="flex-1 flex flex-col min-w-0 gap-1">
        {/* Warehouse warning banner */}
        {preflight && !preflight.warehouses_available && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>ProまたはサーバーレスSQLウェアハウスが見つかりません — スペース作成に失敗します。</span>
            <Tooltip
              side="bottom"
              className="w-80 text-left leading-relaxed"
              content={
                <div className="space-y-2">
                  <p className="font-semibold">修正方法：</p>
                  {!preflight.obo_enabled && (
                    <p><span className="font-medium">方法1 — OBO認証を有効にする：</span> ワークスペース管理者にワークスペースのプレビュー設定でOn-Behalf-Of User Authorizationを有効にするよう依頼してください。これにより、アプリがあなたの代わりに動作し、既にアクセス権のあるSQLウェアハウスにアクセスできます。</p>
                  )}
                  <p><span className="font-medium">{!preflight.obo_enabled ? "方法2" : "修正"} — 直接アクセスを付与：</span> <span className="font-mono">{preflight.app_name}</span> にProまたはサーバーレスSQLウェアハウスのCAN USE権限を付与してください。</p>
                </div>
              }
            >
              <button className="ml-auto flex items-center gap-1 underline underline-offset-2 hover:text-amber-500 whitespace-nowrap">
                <Info className="w-3 h-3" />
                修正方法
              </button>
            </Tooltip>
          </div>
        )}

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto border border-default rounded-xl bg-surface">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-lg font-semibold text-primary mb-2">
                Genieスペースを作成
              </h3>
              <p className="text-sm text-muted max-w-md mb-6">
                構築したい内容を説明すると、AIエージェントがガイドします。
                進捗パネルから直接詳細を入力することもできます。
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  "samples.nyctaxiを使用してNYCタクシー運行分析用のスペースを構築",
                  "samples.tpchから売上分析スペースを作成",
                  "samples.tpcdsで小売データを探索",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="px-3 py-1.5 text-xs text-muted bg-surface-secondary hover:bg-elevated rounded-full border border-default transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-4">
              {groupMessages(messages).map((item) =>
                item.type === "inspection_group"
                  ? renderInspectionGroup(item)
                  : renderMessage(item.msg),
              )}
              {agentStatus && (
                <div className="mx-4 my-2 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-accent animate-spin flex-shrink-0" />
                  <span className="text-xs text-muted">{agentStatus}</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Queued message indicator */}
        {queuedMessage && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <span className="text-xs text-amber-600 dark:text-amber-400 flex-1 truncate">
              キュー: &ldquo;{queuedMessage}&rdquo;
            </span>
            <button
              onClick={() => { queuedMessageRef.current = null; setQueuedMessage(null) }}
              className="text-amber-500 hover:text-amber-600 flex-shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isStreaming
                ? queuedMessage
                  ? "キューのメッセージを編集するか、新しいメッセージを入力..."
                  : "エージェント完了後に送信するメッセージを入力..."
                : "Genieスペースの説明を入力するか、質問に回答..."
            }
            rows={1}
            className="w-full border border-default rounded-xl pl-4 pr-11 py-2.5 text-sm bg-surface text-primary resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
            style={{ minHeight: "40px", maxHeight: "120px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = "auto"
              target.style.height = Math.min(target.scrollHeight, 120) + "px"
            }}
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <div className="w-2.5 h-2.5 rounded-sm bg-red-400" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-lg bg-accent text-white disabled:opacity-30 hover:bg-accent/90 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </form>
      </div>

      {/* Table browser drawer */}
      {drawerOpen && (
        <TableBrowserDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          selectedTables={progress.tables}
          onApplyChanges={(added, removed) => {
            const nextTables = [...progress.tables.filter((t) => !removed.includes(t)), ...added]
            setProgress((p) => ({ ...p, tables: nextTables }))
            const parts: string[] = []
            if (added.length) parts.push(`追加: ${added.map((t) => `\`${t}\``).join(", ")}`)
            if (removed.length) parts.push(`削除: ${removed.map((t) => `\`${t}\``).join(", ")}`)
            if (parts.length) sendMessage(
              `テーブルの選択を更新しました。${parts.join("。")}`,
              { selected_tables: nextTables }
            )
            setDrawerOpen(false)
          }}
        />
      )}

      {/* Progress panel */}
      {panelOpen && renderPanel()}

      {/* Clear confirmation dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface border border-default rounded-xl shadow-xl p-5 max-w-sm mx-4">
            <h3 className="text-sm font-semibold text-primary mb-2">やり直しますか？</h3>
            <p className="text-xs text-muted mb-4">
              会話全体、すべての進捗、未保存の計画がクリアされます。この操作は元に戻せません。
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1.5 text-xs font-medium text-secondary border border-default rounded-md hover:bg-elevated transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={confirmClear}
                className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-500 transition-colors"
              >
                すべてクリア
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
