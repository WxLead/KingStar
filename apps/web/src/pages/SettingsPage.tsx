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
} from 'lucide-react'
import { Kbd } from '@/components/ui/kbd'
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
  'h-11 w-full rounded-xl border border-[#e4e6f0] bg-white px-3.5 text-[14px] text-ink outline-none transition placeholder:text-[#b0b5c9] focus:border-[#c7c9ef] focus:ring-2 focus:ring-[#eef0fb]'

const sectionVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
}

function ShortcutRow({
  id,
  label,
  description,
  recording,
  onStartRecord,
  onStopRecord,
}: {
  id: ShortcutId
  label: string
  description: string
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
    <div className="flex flex-wrap items-center gap-3 border-b border-[#eceef6] px-1 py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-ink">{label}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-[#6a70a0]">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <Kbd className="h-9 min-w-[5rem] bg-[#eef0fb] px-3 text-[13px] font-semibold text-[#4f46e5]">
          {recording ? '按下快捷键…' : formatShortcut(binding)}
        </Kbd>
        <button
          type="button"
          onClick={() => (recording ? onStopRecord() : onStartRecord())}
          className={`rounded-xl px-3.5 py-2 text-[13px] font-semibold transition ${
            recording
              ? 'bg-[#4f46e5] text-white shadow-sm'
              : 'border border-[#e4e6f0] bg-white text-[#6a70a0] hover:border-[#c7c9ef] hover:text-[#4f46e5]'
          }`}
        >
          {recording ? '取消' : '更改'}
        </button>
      </div>
    </div>
  )
}

function sourceLabel(source: LlmSettingsPublic['source']): string {
  if (source === 'settings') return '通用设置'
  if (source === 'env') return '环境变量'
  return '未配置'
}

function LlmSettingsSection() {
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
      setErr(e instanceof Error ? e.message : '加载 AI 设置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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
        setModelsHint(res.detail || `已加载 ${res.models.length} 个模型`)
        if (!res.models.includes(model)) {
          setModel(res.models[0])
        }
      } else {
        setModels([])
        setManualModel(true)
        setModelsHint(res.detail || '未查询到模型，请手动填写模型名称。')
      }
    } catch (e) {
      setModels([])
      setManualModel(true)
      setModelsHint(
        e instanceof Error
          ? e.message
          : '查询失败：可能是中转站未开放 /models，或 URL / Key 有误。可手动填写模型名。',
      )
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
      setMsg('已保存。翻译与 AI 助手立即使用新配置（无需重启）。')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onClearKey = async () => {
    if (!confirm('清除已保存的 API Key？仍可回退到环境变量中的密钥。')) return
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
      setMsg('已清除设置中的 API Key')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '清除失败')
    } finally {
      setSaving(false)
    }
  }

  const canProbe =
    Boolean(baseUrl.trim()) && (keyTouched ? Boolean(apiKey.trim()) : Boolean(meta?.api_key_set))

  return (
    <motion.section
      variants={sectionVariants}
      className="overflow-hidden rounded-2xl border border-[#e8e9f4] bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-[#eceef6] bg-gradient-to-r from-[#f7f8fd] to-white px-5 py-3.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eef0fb] text-[#4f46e5]">
          <Sparkles size={15} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-ink">AI API</h2>
          <p className="text-[12px] text-[#9aa0b8]">OpenAI 兼容 · 翻译 + 阅读助手</p>
        </div>
        {meta ? (
          <span className="ml-auto inline-flex items-center rounded-full bg-[#eef0fb] px-2.5 py-1 text-[11px] font-semibold text-[#4f46e5]">
            {sourceLabel(meta.source)}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-5 py-10 text-[14px] text-[#9aa0b8]">
          <Loader2 size={15} className="animate-spin" />
          加载中…
        </div>
      ) : (
        <div className="space-y-5 px-5 py-5">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-wide text-[#6a70a0]">
              API Key
            </span>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                placeholder={
                  meta?.api_key_set
                    ? `已配置 ${meta.api_key_masked}（留空则保持不变）`
                    : 'sk-… 或供应商提供的密钥'
                }
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setKeyTouched(true)
                }}
                className={`${fieldCls} pr-11`}
                autoComplete="off"
              />
              <button
                type="button"
                title={showKey ? '隐藏' : '显示'}
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#8b91b3] transition hover:bg-[#f3f4fb] hover:text-ink"
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-wide text-[#6a70a0]">
              Base URL
            </span>
            <div className="flex flex-wrap gap-2">
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
                title={!canProbe ? '请先填写 Base URL 与 API Key' : '从厂家拉取可用模型'}
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[#e4e6f0] bg-white px-3.5 text-[13px] font-semibold text-[#6a70a0] transition hover:border-[#c7c9ef] hover:bg-[#eef0fb] hover:text-[#4f46e5] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {probing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                查询模型
              </button>
            </div>
            <span className="mt-1.5 block text-[12px] leading-relaxed text-[#9aa0b8]">
              DeepSeek / OpenAI / Kimi 及多数中转站均支持 OpenAI 兼容接口。
            </span>
          </label>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold tracking-wide text-[#6a70a0]">Model</span>
              {models.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setManualModel((v) => !v)}
                  className="text-[12px] font-semibold text-[#4f46e5] hover:underline"
                >
                  {manualModel ? '改用下拉选择' : '手动输入'}
                </button>
              ) : null}
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
                placeholder="deepseek-chat / gpt-4o-mini / moonshot-v1-auto …"
                className={fieldCls}
              />
            )}
            {modelsHint ? (
              <p
                className={`mt-1.5 text-[12.5px] leading-relaxed ${
                  models.length ? 'text-[#059669]' : 'text-[#d97706]'
                }`}
              >
                {modelsHint}
              </p>
            ) : (
              <p className="mt-1.5 text-[12px] text-[#9aa0b8]">
                未查询时也可手填模型名。查询失败常见于 URL/Key 有误，或中转站未实现 /models。
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[#eceef6] pt-4">
            <button
              type="button"
              disabled={saving}
              onClick={() => void onSave()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#4f46e5] px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              保存
            </button>
            <button
              type="button"
              disabled={saving || !meta?.api_key_set}
              onClick={() => void onClearKey()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#e4e6f0] bg-white px-3.5 py-2.5 text-[13px] font-semibold text-[#6a70a0] transition hover:border-[#fecaca] hover:text-[#dc2626] disabled:opacity-40"
            >
              清除 Key
            </button>
          </div>

          {msg ? <p className="text-[13px] font-medium text-[#059669]">{msg}</p> : null}
          {err ? <p className="text-[13px] font-medium text-[#dc2626]">{err}</p> : null}
        </div>
      )}
    </motion.section>
  )
}

export default function SettingsPage() {
  const [recordingId, setRecordingId] = useState<ShortcutId | null>(null)

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-[#e8e9f4] bg-[#f8f8fd]">
      <ListPageHero
        title="通用设置"
        subtitle="配置 AI 接口与快捷键；API 保存在服务端，快捷键保存在本机。"
        action={
          <button
            type="button"
            onClick={() => {
              setRecordingId(null)
              resetShortcuts()
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#e4e6f0] bg-white px-4 py-2 text-[13px] font-bold text-[#6a70a0] shadow-sm transition hover:border-[#c7c9ef] hover:text-[#4f46e5]"
          >
            <RotateCcw size={14} />
            恢复快捷键默认
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.08 } },
          }}
          className="space-y-4"
        >
          <LlmSettingsSection />

          <motion.section
            variants={sectionVariants}
            className="overflow-hidden rounded-2xl border border-[#e8e9f4] bg-white shadow-sm"
          >
            <div className="flex items-center gap-2 border-b border-[#eceef6] bg-gradient-to-r from-[#f7f8fd] to-white px-5 py-3.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eef0fb] text-[#4f46e5]">
                <Keyboard size={15} />
              </span>
              <div>
                <h2 className="text-[15px] font-bold text-ink">快捷键</h2>
                <p className="text-[12px] text-[#9aa0b8]">点击更改后按下新组合（需含 Ctrl / ⌘）</p>
              </div>
            </div>
            <div className="px-5">
              {SHORTCUT_DEFS.map((def) => (
                <ShortcutRow
                  key={def.id}
                  id={def.id}
                  label={def.label}
                  description={def.description}
                  recording={recordingId === def.id}
                  onStartRecord={() => setRecordingId(def.id)}
                  onStopRecord={() => setRecordingId(null)}
                />
              ))}
            </div>
          </motion.section>

          <motion.p
            variants={sectionVariants}
            className="px-1 text-[12.5px] leading-relaxed text-[#9aa0b8]"
          >
            AI API 支持任意 OpenAI 兼容服务，保存后立即用于文献翻译与阅读室助手。快捷键冲突时会自动互换。
          </motion.p>
        </motion.div>
      </div>
    </div>
  )
}
