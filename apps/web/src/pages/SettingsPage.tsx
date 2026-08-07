import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  RotateCcw,
  Keyboard,
  Sparkles,
  Eye,
  EyeOff,
  Save,
  Loader2,
  RefreshCw,
  Settings2,
  ChevronRight,
} from 'lucide-react'
import { Kbd } from '@/components/ui/kbd'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import ListPageHero from '@/features/layout/ListPageHero'
import {
  SHORTCUT_DEFS,
  bindingFromKeyboardEvent,
  formatShortcut,
  resetShortcuts,
  setShortcut,
  useKeyboardShortcuts,
  type ShortcutId,
} from '@/features/settings/keyboardShortcuts'
import {
  getLlmSettings,
  listLlmModels,
  saveLlmSettings,
  type LlmSettingsPublic,
} from '@/services/api'

const fieldCls =
  'h-10 w-full rounded-xl border border-[#e4e6f0] bg-white px-3 text-[14px] text-ink outline-none transition placeholder:text-[#b0b5c9] focus:border-[#c7c9ef] focus:ring-2 focus:ring-[#eef0fb]'

function sourceLabel(source: LlmSettingsPublic['source']): string {
  if (source === 'settings') return '已保存'
  if (source === 'env') return '环境变量'
  return '未配置'
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-[12px] font-semibold tracking-wide text-[#6a70a0]">
      {children}
    </span>
  )
}

function SettingsEntry({
  icon,
  title,
  summary,
  onConfigure,
}: {
  icon: React.ReactNode
  title: string
  summary: React.ReactNode
  onConfigure: () => void
}) {
  return (
    <button
      type="button"
      onClick={onConfigure}
      className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-[#f0f1f7] px-6 py-5 text-left transition last:border-b-0 hover:bg-[#fafbff]"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef0fb] text-[#4f46e5]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-bold text-ink">{title}</p>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2">{summary}</div>
      </div>
      <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#e4e6f0] bg-white px-3.5 text-[13px] font-semibold text-[#6a70a0] transition group-hover:border-[#c7c9ef] group-hover:text-[#4f46e5]">
        <Settings2 size={14} />
        配置
        <ChevronRight size={14} className="opacity-50" />
      </span>
    </button>
  )
}

function ShortcutRow({
  id,
  label,
  recording,
  onStartRecord,
  onStopRecord,
}: {
  id: ShortcutId
  label: string
  recording: boolean
  onStartRecord: () => void
  onStopRecord: () => void
}) {
  const shortcuts = useKeyboardShortcuts()
  const binding = shortcuts[id]

  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onStopRecord()
        return
      }
      const next = bindingFromKeyboardEvent(e)
      if (!next) return
      e.preventDefault()
      e.stopPropagation()
      setShortcut(id, next)
      onStopRecord()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, id, onStopRecord])

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-[#f0f1f7] py-3 last:border-b-0">
      <p className="min-w-0 truncate text-[14px] font-semibold text-ink">{label}</p>
      <div className="flex items-center gap-2">
        <Kbd className="h-8 min-w-[4.75rem] bg-[#eef0fb] px-2.5 text-[12px] font-semibold text-[#4f46e5]">
          {recording ? '按下…' : formatShortcut(binding)}
        </Kbd>
        <button
          type="button"
          onClick={() => (recording ? onStopRecord() : onStartRecord())}
          className={`h-8 rounded-lg px-3 text-[12px] font-semibold transition ${
            recording
              ? 'bg-[#4f46e5] text-white'
              : 'border border-[#e4e6f0] bg-white text-[#6a70a0] hover:border-[#c7c9ef] hover:text-[#4f46e5]'
          }`}
        >
          {recording ? '取消' : '更改'}
        </button>
      </div>
    </div>
  )
}

function LlmConfigDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (meta: LlmSettingsPublic) => void
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [probing, setProbing] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com')
  const [model, setModel] = useState('deepseek-v4-flash')
  const [meta, setMeta] = useState<LlmSettingsPublic | null>(null)
  const [keyTouched, setKeyTouched] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [modelsHint, setModelsHint] = useState<string | null>(null)
  const [manualModel, setManualModel] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    setMsg(null)
    try {
      const s = await getLlmSettings()
      setMeta(s)
      setBaseUrl(s.base_url || 'https://api.deepseek.com')
      setModel(s.model || 'deepseek-v4-flash')
      setApiKey('')
      setKeyTouched(false)
      setModels([])
      setModelsHint(null)
      setManualModel(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const onProbeModels = async () => {
    setProbing(true)
    setModelsHint(null)
    setErr(null)
    try {
      const res = await listLlmModels({
        base_url: baseUrl.trim() || null,
        api_key: keyTouched && apiKey.trim() ? apiKey.trim() : null,
      })
      if (res.ok && res.models.length) {
        setModels(res.models)
        setManualModel(false)
        setModelsHint(`已加载 ${res.models.length} 个`)
        if (!res.models.includes(model)) setModel(res.models[0])
      } else {
        setModels([])
        setManualModel(true)
        setModelsHint(res.detail || '未查到模型，请手填')
      }
    } catch (e) {
      setModels([])
      setManualModel(true)
      setModelsHint(e instanceof Error ? e.message : '查询失败，可手填模型名')
    } finally {
      setProbing(false)
    }
  }

  const onSave = async () => {
    setSaving(true)
    setMsg(null)
    setErr(null)
    try {
      const next = await saveLlmSettings({
        base_url: baseUrl.trim() || null,
        model: model.trim() || null,
        api_key: keyTouched ? apiKey.trim() || null : null,
      })
      setMeta(next)
      setApiKey('')
      setKeyTouched(false)
      setMsg('已保存')
      onSaved(next)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onClearKey = async () => {
    if (!confirm('清除已保存的 API Key？')) return
    setSaving(true)
    setErr(null)
    setMsg(null)
    try {
      const next = await saveLlmSettings({
        clear_api_key: true,
        base_url: baseUrl.trim() || null,
        model: model.trim() || null,
      })
      setMeta(next)
      setApiKey('')
      setKeyTouched(false)
      setMsg('已清除 Key')
      onSaved(next)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '清除失败')
    } finally {
      setSaving(false)
    }
  }

  const canProbe =
    Boolean(baseUrl.trim()) && (keyTouched ? Boolean(apiKey.trim()) : Boolean(meta?.api_key_set))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,640px)] gap-0 overflow-hidden rounded-2xl border-[#e8e9f4] p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-[#eceef6] px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-[16px] text-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eef0fb] text-[#4f46e5]">
              <Sparkles size={15} />
            </span>
            AI API
          </DialogTitle>
          <DialogDescription className="sr-only">配置大模型接口</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 px-5 py-10 text-[13px] text-[#9aa0b8]">
            <Loader2 size={14} className="animate-spin" />
            加载中…
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto px-5 py-4">
            <label className="block">
              <FieldLabel>API Key</FieldLabel>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  placeholder={
                    meta?.api_key_set ? `已配置 ${meta.api_key_masked}` : 'sk-…'
                  }
                  onChange={(e) => {
                    setApiKey(e.target.value)
                    setKeyTouched(true)
                  }}
                  className={`${fieldCls} pr-10`}
                  autoComplete="off"
                />
                <button
                  type="button"
                  title={showKey ? '隐藏' : '显示'}
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-[#8b91b3] transition hover:bg-[#f3f4fb] hover:text-ink"
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </label>

            <label className="block">
              <FieldLabel>Base URL</FieldLabel>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => {
                    setBaseUrl(e.target.value)
                    setModels([])
                    setModelsHint(null)
                  }}
                  placeholder="https://api.openai.com/v1"
                  className={`${fieldCls} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  disabled={probing || !canProbe}
                  onClick={() => void onProbeModels()}
                  title={!canProbe ? '请先填写 Base URL 与 API Key' : undefined}
                  className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-[#e4e6f0] bg-white px-3 text-[12px] font-semibold text-[#6a70a0] transition hover:border-[#c7c9ef] hover:text-[#4f46e5] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {probing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  查询
                </button>
              </div>
            </label>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <FieldLabel>Model</FieldLabel>
                {models.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setManualModel((v) => !v)}
                    className="mb-1.5 text-[11px] font-semibold text-[#4f46e5] hover:underline"
                  >
                    {manualModel ? '下拉选择' : '手填'}
                  </button>
                ) : (
                  <span className="mb-1.5" />
                )}
              </div>
              {!manualModel && models.length > 0 ? (
                <select
                  value={models.includes(model) ? model : models[0]}
                  onChange={(e) => setModel(e.target.value)}
                  className={fieldCls}
                >
                  {models.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="deepseek-chat"
                  className={fieldCls}
                />
              )}
              {modelsHint ? (
                <p
                  className={`mt-1 text-[11px] ${
                    models.length ? 'text-[#059669]' : 'text-[#d97706]'
                  }`}
                >
                  {modelsHint}
                </p>
              ) : null}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-[#f0f1f7] px-5 py-3">
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void onSave()}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#4f46e5] px-3.5 text-[13px] font-bold text-white transition hover:opacity-95 disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            保存
          </button>
          <button
            type="button"
            disabled={saving || loading || !meta?.api_key_set}
            onClick={() => void onClearKey()}
            className="inline-flex h-9 items-center rounded-xl border border-[#e4e6f0] bg-white px-3 text-[12px] font-semibold text-[#6a70a0] transition hover:border-[#fecaca] hover:text-[#dc2626] disabled:opacity-40"
          >
            清除 Key
          </button>
          {msg ? <span className="text-[12px] font-medium text-[#059669]">{msg}</span> : null}
          {err ? <span className="text-[12px] font-medium text-[#dc2626]">{err}</span> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ShortcutsConfigDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [recordingId, setRecordingId] = useState<ShortcutId | null>(null)

  useEffect(() => {
    if (!open) setRecordingId(null)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,560px)] gap-0 overflow-hidden rounded-2xl border-[#e8e9f4] p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-[#eceef6] px-5 py-4 text-left">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div>
              <DialogTitle className="flex items-center gap-2 text-[16px] text-ink">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eef0fb] text-[#4f46e5]">
                  <Keyboard size={15} />
                </span>
                快捷键
              </DialogTitle>
              <DialogDescription className="sr-only">修改键盘快捷键</DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => {
                setRecordingId(null)
                resetShortcuts()
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e4e6f0] bg-white px-2.5 text-[12px] font-semibold text-[#6a70a0] transition hover:border-[#c7c9ef] hover:text-[#4f46e5]"
            >
              <RotateCcw size={13} />
              恢复默认
            </button>
          </div>
        </DialogHeader>
        <div className="overflow-y-auto px-5 py-1">
          {SHORTCUT_DEFS.map((def) => (
            <ShortcutRow
              key={def.id}
              id={def.id}
              label={def.label}
              recording={recordingId === def.id}
              onStartRecord={() => setRecordingId(def.id)}
              onStopRecord={() => setRecordingId(null)}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SummaryChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full truncate rounded-full bg-[#f3f4fb] px-2.5 py-0.5 text-[12px] font-medium text-[#6a70a0]">
      {children}
    </span>
  )
}

export default function SettingsPage() {
  const shortcuts = useKeyboardShortcuts()
  const [llmMeta, setLlmMeta] = useState<LlmSettingsPublic | null>(null)
  const [llmLoading, setLlmLoading] = useState(true)
  const [llmOpen, setLlmOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLlmLoading(true)
      try {
        const s = await getLlmSettings()
        if (!cancelled) setLlmMeta(s)
      } catch {
        if (!cancelled) setLlmMeta(null)
      } finally {
        if (!cancelled) setLlmLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-[#e8e9f4] bg-[#f8f8fd]">
      <ListPageHero title="通用设置" subtitle="AI 接口与快捷键" />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden rounded-2xl border border-[#e8e9f4] bg-white shadow-sm"
        >
          <SettingsEntry
            icon={<Sparkles size={18} />}
            title="AI API"
            onConfigure={() => setLlmOpen(true)}
            summary={
              llmLoading ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-[#9aa0b8]">
                  <Loader2 size={12} className="animate-spin" />
                  加载中…
                </span>
              ) : llmMeta ? (
                <>
                  <SummaryChip>{sourceLabel(llmMeta.source)}</SummaryChip>
                  {llmMeta.api_key_set ? (
                    <SummaryChip>Key {llmMeta.api_key_masked}</SummaryChip>
                  ) : (
                    <SummaryChip>未设置 Key</SummaryChip>
                  )}
                  {llmMeta.model ? <SummaryChip>{llmMeta.model}</SummaryChip> : null}
                </>
              ) : (
                <SummaryChip>加载失败</SummaryChip>
              )
            }
          />

          <SettingsEntry
            icon={<Keyboard size={18} />}
            title="快捷键"
            onConfigure={() => setShortcutsOpen(true)}
            summary={SHORTCUT_DEFS.map((def) => (
              <span key={def.id} className="inline-flex items-center gap-1.5">
                <span className="text-[12px] text-[#9aa0b8]">{def.label}</span>
                <Kbd className="h-6 bg-[#eef0fb] px-2 text-[11px] font-semibold text-[#4f46e5]">
                  {formatShortcut(shortcuts[def.id])}
                </Kbd>
              </span>
            ))}
          />
        </motion.div>
      </div>

      <LlmConfigDialog
        open={llmOpen}
        onOpenChange={setLlmOpen}
        onSaved={setLlmMeta}
      />
      <ShortcutsConfigDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  )
}
