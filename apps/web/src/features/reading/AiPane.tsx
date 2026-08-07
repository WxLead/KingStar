import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import {
  Sparkles,
  Send,
  Loader2,
  Copy,
  Check,
  NotebookPen,
  ChevronDown,
  ChevronUp,
  Quote,
  X,
  MessageSquarePlus,
  Trash2,
  History,
  PanelLeftClose,
} from 'lucide-react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import ReadingPaneHeader from '@/features/reading/ReadingPaneHeader'
import { prepareAiChatMarkdown } from '@/features/parse/markdownMath'
import {
  ellipsizeQuote,
  quoteSourceLabel,
  registerAiQuoteHandler,
  type AiQuotePayload,
} from '@/features/reading/aiQuoteBridge'
import {
  createEmptySession,
  defaultWelcomeMsg,
  deriveSessionTitle,
  formatSessionTime,
  getActiveSession,
  loadAiChatStore,
  saveAiChatStore,
  sessionHasUserContent,
  type AiChatSession,
  type AiChatStore,
  type StoredChatMsg,
} from '@/features/reading/aiChatSessions'
import { formatShortcut, useKeyboardShortcuts } from '@/features/settings/keyboardShortcuts'
import { importMarkdownToNotes } from '@/features/reading/notesImportBridge'
import {
  readingChatStream,
  type ReadingChatMessage,
  type ReadingChatUsage,
} from '@/services/api'

const AI_SPLIT_KEY = 'start:reading-ai-chat-split'
const DEFAULT_AI_SPLIT = { messages: 72, composer: 28 }

function loadAiSplit(): Record<string, number> {
  try {
    const raw = localStorage.getItem(AI_SPLIT_KEY)
    if (!raw) return { ...DEFAULT_AI_SPLIT }
    const parsed = JSON.parse(raw) as Record<string, number>
    if (typeof parsed.messages === 'number' && typeof parsed.composer === 'number') {
      return parsed
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_AI_SPLIT }
}

type ChatMsg = StoredChatMsg & { streaming?: boolean }

type AiPaneProps = {
  uploadId: string
  filename: string
  markdown?: string
  zhMarkdown?: string | null
}

function sessionToMsgs(session: AiChatSession): ChatMsg[] {
  return session.msgs.map((m) => ({ ...m, streaming: false }))
}

function msgsToStored(msgs: ChatMsg[]): StoredChatMsg[] {
  return msgs
    .filter((m) => !m.streaming)
    .map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      collapsed: Boolean(m.collapsed),
      quote: m.quote,
    }))
}

function buildMessageWithQuote(question: string, quote?: AiQuotePayload | null): string {
  const q = question.trim()
  if (!quote?.text.trim()) return q
  const label = quoteSourceLabel(quote.source)
  return `【文献摘录 · ${label}】\n${quote.text.trim()}\n\n${q}`
}

function extractErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return '请求失败，请稍后重试。'
  const raw = err.message || ''
  try {
    const parsed = JSON.parse(raw) as { detail?: string | { msg?: string }[] }
    if (typeof parsed.detail === 'string') return parsed.detail
    if (Array.isArray(parsed.detail) && parsed.detail[0]?.msg) return parsed.detail[0].msg
  } catch {
    /* plain text */
  }
  return raw || '请求失败，请稍后重试。'
}

function ContextMeter({ usage }: { usage: ReadingChatUsage | null }) {
  if (!usage || !usage.budget) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-[#eceef6] bg-white/50 px-4 py-1.5">
        <span className="text-[11px] text-[#9aa0b8]">上下文</span>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#e8eaf4]" />
        <span className="text-[11px] tabular-nums text-[#9aa0b8]">—</span>
      </div>
    )
  }
  const pct = Math.min(100, Math.max(0, usage.pct))
  const tone =
    pct >= 90 ? 'text-[#dc2626]' : pct >= 70 ? 'text-[#d97706]' : 'text-[#6a70a0]'
  const bar =
    pct >= 90 ? 'bg-[#dc2626]' : pct >= 70 ? 'bg-[#d97706]' : 'bg-[#4f46e5]'
  return (
    <div
      className="flex shrink-0 items-center gap-2.5 border-b border-[#eceef6] bg-white/50 px-4 py-1.5"
      title={`约 ${usage.used.toLocaleString()} / ${usage.budget.toLocaleString()} tokens`}
    >
      <span className="shrink-0 text-[11px] font-medium text-[#9aa0b8]">上下文</span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#e8eaf4]">
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`shrink-0 text-[11px] font-semibold tabular-nums ${tone}`}>{pct.toFixed(0)}%</span>
    </div>
  )
}

function previewText(text: string, max = 72): string {
  const one = text.replace(/\s+/g, ' ').trim()
  if (one.length <= max) return one
  return `${one.slice(0, max)}…`
}

function AssistantMarkdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const prepared = useMemo(() => {
    const raw = text || (streaming ? '_正在思考…_' : '')
    return prepareAiChatMarkdown(raw)
  }, [text, streaming])

  return (
    <div className={`ai-chat-md md-render text-[13.5px] leading-relaxed text-ink ${streaming ? 'opacity-95' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: 'ignore' }]]}
      >
        {prepared}
      </ReactMarkdown>
      {streaming && text ? (
        <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-[#4f46e5] align-[-0.1em]" />
      ) : null}
    </div>
  )
}

function BubbleActions({
  text,
  collapsed,
  onToggle,
  onCopiedToast,
  onImportToast,
}: {
  text: string
  collapsed?: boolean
  onToggle: () => void
  onCopiedToast: () => void
  onImportToast: (ok: boolean) => void
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      onCopiedToast()
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked */
    }
  }

  const toNotes = () => {
    const ok = importMarkdownToNotes({
      title: 'AI 摘录',
      markdown: text,
    })
    onImportToast(ok)
  }

  if (!text.trim()) return null

  return (
    <div className="mt-2 flex items-center gap-0.5 border-t border-[#eceef6] pt-1.5">
      <button
        type="button"
        title={collapsed ? '展开' : '折叠'}
        onClick={onToggle}
        className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-[#6a70a0] transition hover:bg-[#f3f4fb] hover:text-ink"
      >
        {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        {collapsed ? '展开' : '折叠'}
      </button>
      <button
        type="button"
        title="复制"
        onClick={() => void copy()}
        className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-[#6a70a0] transition hover:bg-[#f3f4fb] hover:text-ink"
      >
        {copied ? <Check size={13} className="text-[#059669]" /> : <Copy size={13} />}
        {copied ? '已复制' : '复制'}
      </button>
      <button
        type="button"
        title="导入到笔记（高亮块）"
        onClick={toNotes}
        className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-[#6a70a0] transition hover:bg-[#f3f4fb] hover:text-ink"
      >
        <NotebookPen size={13} />
        笔记
      </button>
    </div>
  )
}

function applyActivePatch(
  store: AiChatStore,
  patch: Partial<AiChatSession> & { msgs?: StoredChatMsg[] },
): AiChatStore {
  const now = Date.now()
  const sessions = store.sessions.map((s) => {
    if (s.id !== store.activeId) return s
    const nextMsgs = patch.msgs ?? s.msgs
    return {
      ...s,
      ...patch,
      msgs: nextMsgs,
      title: deriveSessionTitle(nextMsgs),
      updatedAt: now,
    }
  })
  return {
    ...store,
    sessions: sessions.sort((a, b) => b.updatedAt - a.updatedAt),
  }
}

/** AI chat pane for reading room — DeepSeek via BFF (SSE streaming). */
export function AiPane({
  uploadId,
  filename,
  markdown = '',
  zhMarkdown = null,
}: AiPaneProps) {
  const boot = useMemo(() => loadAiChatStore(uploadId, filename), [uploadId, filename])
  const [store, setStore] = useState<AiChatStore>(boot)
  const [input, setInput] = useState('')
  const [quote, setQuote] = useState<AiQuotePayload | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const active = getActiveSession(store)
  const [msgs, setMsgs] = useState<ChatMsg[]>(() => sessionToMsgs(active))
  const [usage, setUsage] = useState<ReadingChatUsage | null>(active.usage)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef(0)
  const abortCtrlRef = useRef<AbortController | null>(null)
  const paperDigestRef = useRef(active.paperDigest)
  const paperBootstrappedRef = useRef(active.paperBootstrapped)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readyRef = useRef(false)
  const activeIdRef = useRef(store.activeId)
  const msgsRef = useRef(msgs)
  const usageRef = useRef(usage)

  activeIdRef.current = store.activeId
  msgsRef.current = msgs
  usageRef.current = usage

  const hydrateFromStore = (next: AiChatStore) => {
    const s = getActiveSession(next)
    setStore(next)
    setMsgs(sessionToMsgs(s))
    setUsage(s.usage)
    paperDigestRef.current = s.paperDigest
    paperBootstrappedRef.current = s.paperBootstrapped
    setInput('')
    setQuote(null)
  }

  // Switch literature → reload sessions
  useEffect(() => {
    const next = loadAiChatStore(uploadId, filename)
    hydrateFromStore(next)
    setBusy(false)
    readyRef.current = true
    return () => {
      readyRef.current = false
      if (saveTimer.current) clearTimeout(saveTimer.current)
      abortCtrlRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount on paper change only
  }, [uploadId, filename])

  useEffect(() => {
    return registerAiQuoteHandler((payload) => {
      setQuote(payload)
      window.setTimeout(() => textareaRef.current?.focus(), 0)
    })
  }, [])

  // Persist active session into multi-session store
  useEffect(() => {
    if (!readyRef.current || busy) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setStore((prev) => {
        const next = applyActivePatch(prev, {
          msgs: msgsToStored(msgs),
          paperDigest: paperDigestRef.current,
          paperBootstrapped: paperBootstrappedRef.current,
          usage,
        })
        saveAiChatStore(uploadId, { ...next, filename })
        return next
      })
    }, 350)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [uploadId, filename, msgs, usage, busy, store.activeId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, busy])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast])

  const abortActiveStream = () => {
    abortRef.current += 1
    abortCtrlRef.current?.abort()
    abortCtrlRef.current = null
    setBusy(false)
  }

  const flushActiveToStore = (base?: AiChatStore): AiChatStore => {
    const prev = base ?? store
    return applyActivePatch(prev, {
      msgs: msgsToStored(msgsRef.current),
      paperDigest: paperDigestRef.current,
      paperBootstrapped: paperBootstrappedRef.current,
      usage: usageRef.current,
    })
  }

  const clearChatWindow = () => {
    abortActiveStream()
    setMsgs([{ ...defaultWelcomeMsg(filename), streaming: false }])
    setUsage(null)
    setInput('')
    setQuote(null)
    setToast('已清空当前聊天')
  }

  const startNewChat = () => {
    abortActiveStream()
    let next = flushActiveToStore()
    const current = getActiveSession(next)

    if (sessionHasUserContent(current)) {
      const fresh = createEmptySession(filename)
      next = {
        ...next,
        activeId: fresh.id,
        sessions: [fresh, ...next.sessions].sort((a, b) => b.updatedAt - a.updatedAt),
      }
    } else {
      const fresh = createEmptySession(filename)
      next = {
        ...next,
        activeId: fresh.id,
        sessions: next.sessions
          .map((s) => (s.id === current.id ? { ...fresh, id: current.id } : s))
          .sort((a, b) => b.updatedAt - a.updatedAt),
      }
    }

    saveAiChatStore(uploadId, { ...next, filename })
    hydrateFromStore(next)
    setToast('已新开对话')
  }

  const switchSession = (id: string) => {
    if (id === store.activeId) return
    abortActiveStream()
    let next = flushActiveToStore()
    if (!next.sessions.some((s) => s.id === id)) return
    next = { ...next, activeId: id }
    saveAiChatStore(uploadId, { ...next, filename })
    hydrateFromStore(next)
  }

  const deleteSession = (id: string) => {
    abortActiveStream()
    let next = flushActiveToStore()
    const remaining = next.sessions.filter((s) => s.id !== id)
    if (!remaining.length) {
      const fresh = createEmptySession(filename)
      next = { ...next, activeId: fresh.id, sessions: [fresh] }
    } else {
      const activeId = id === next.activeId ? remaining[0].id : next.activeId
      next = { ...next, activeId, sessions: remaining }
    }
    saveAiChatStore(uploadId, { ...next, filename })
    hydrateFromStore(next)
    setToast('已删除会话')
  }

  const toggleHistory = () => {
    setStore((prev) => {
      const next = { ...prev, historyOpen: !prev.historyOpen }
      saveAiChatStore(uploadId, { ...next, filename })
      return next
    })
  }

  const send = async () => {
    const t = input.trim()
    if (!t || busy) return

    const attached = quote
    const apiMessage = buildMessageWithQuote(t, attached)
    const userMsg: ChatMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: t,
      quote: attached || undefined,
    }
    const assistantId = `a-${Date.now()}`
    const history: ReadingChatMessage[] = [...msgs]
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({
        role: m.role,
        content: m.role === 'user' ? buildMessageWithQuote(m.text, m.quote) : m.text,
      }))

    const firstPaperTurn = !paperBootstrappedRef.current
    const paperDigest = paperDigestRef.current
    const sessionToken = activeIdRef.current

    setMsgs((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', text: '', streaming: true },
    ])
    setInput('')
    setQuote(null)
    setBusy(true)
    const token = ++abortRef.current
    abortCtrlRef.current?.abort()
    const ctrl = new AbortController()
    abortCtrlRef.current = ctrl

    try {
      await readingChatStream(
        {
          message: apiMessage,
          filename,
          markdown: firstPaperTurn ? markdown.slice(0, 80_000) : '',
          zhMarkdown: firstPaperTurn ? (zhMarkdown || '').slice(0, 80_000) : '',
          paperDigest: firstPaperTurn ? '' : paperDigest,
          history,
        },
        {
          signal: ctrl.signal,
          onUsage: (u) => {
            if (token !== abortRef.current || activeIdRef.current !== sessionToken) return
            setUsage(u)
            if (u.paper_digest) paperDigestRef.current = u.paper_digest
          },
          onCompacted: (detail) => {
            if (token !== abortRef.current) return
            setToast(detail)
          },
          onDelta: (chunk) => {
            if (token !== abortRef.current || activeIdRef.current !== sessionToken) return
            setMsgs((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, text: m.text + chunk, streaming: true } : m,
              ),
            )
          },
          onDone: (info) => {
            if (token !== abortRef.current || activeIdRef.current !== sessionToken) return
            paperBootstrappedRef.current = true
            if (info.paper_digest) paperDigestRef.current = info.paper_digest
            if (typeof info.pct === 'number' && info.budget) {
              setUsage({
                used: info.used || 0,
                budget: info.budget,
                pct: info.pct,
                paper_digest: info.paper_digest,
              })
            }
            setMsgs((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      streaming: false,
                      text: m.text.trim() || '（模型未返回内容，请重试。）',
                    }
                  : m,
              ),
            )
          },
        },
      )
    } catch (err) {
      if (token !== abortRef.current || activeIdRef.current !== sessionToken) return
      if (err instanceof DOMException && err.name === 'AbortError') return
      setMsgs((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                streaming: false,
                text: m.text
                  ? `${m.text}\n\n（中断：${extractErrorMessage(err)}）`
                  : `调用失败：${extractErrorMessage(err)}`,
              }
            : m,
        ),
      )
    } finally {
      if (token === abortRef.current) setBusy(false)
    }
  }

  const aiSplit = useMemo(() => loadAiSplit(), [])
  const shortcuts = useKeyboardShortcuts()
  const quoteShortcutLabel = formatShortcut(shortcuts.quoteToAi)
  const historyOpen = store.historyOpen
  const sessions = store.sessions

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f8f8fd]">
      <ReadingPaneHeader
        title="AI 解读"
        actions={
          <div className="flex items-center gap-1">
            <button
              type="button"
              title={historyOpen ? '收起历史会话' : '展开历史会话'}
              onClick={toggleHistory}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[12px] font-semibold transition ${
                historyOpen
                  ? 'border-[#c7c9ef] bg-[#eef0fb] text-[#4f46e5]'
                  : 'border-[#e4e6f0] bg-white text-[#6a70a0] hover:border-[#c7c9ef] hover:text-[#4f46e5]'
              }`}
            >
              <History size={13} />
              历史
            </button>
            <button
              type="button"
              title="新开对话（当前会话保留到历史）"
              onClick={startNewChat}
              className="inline-flex items-center gap-1 rounded-lg border border-[#e4e6f0] bg-white px-2 py-1.5 text-[12px] font-semibold text-[#6a70a0] transition hover:border-[#c7c9ef] hover:text-[#4f46e5]"
            >
              <MessageSquarePlus size={13} />
              新开
            </button>
            <button
              type="button"
              title="清空当前聊天窗口"
              onClick={clearChatWindow}
              className="inline-flex items-center gap-1 rounded-lg border border-[#e4e6f0] bg-white px-2 py-1.5 text-[12px] font-semibold text-[#6a70a0] transition hover:border-[#fecaca] hover:text-[#dc2626]"
            >
              <Trash2 size={13} />
              清空
            </button>
          </div>
        }
      />
      <ContextMeter usage={usage} />

      <div className="flex min-h-0 flex-1">
        <aside
          className={`flex shrink-0 flex-col overflow-hidden border-r border-[#eceef6] bg-[#f3f4fb] transition-[width] duration-200 ease-out ${
            historyOpen ? 'w-[148px]' : 'w-0 border-r-0'
          }`}
        >
          <div className="flex h-9 shrink-0 items-center justify-between px-2.5">
            <span className="text-[11px] font-bold tracking-wide text-[#8b91b3]">会话</span>
            <button
              type="button"
              title="收起"
              onClick={toggleHistory}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#8b91b3] transition hover:bg-white hover:text-[#4f46e5]"
            >
              <PanelLeftClose size={13} />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-1.5 pb-2">
            {sessions.map((s) => {
              const activeRow = s.id === store.activeId
              return (
                <div
                  key={s.id}
                  className={`group relative rounded-lg px-2 py-1.5 transition ${
                    activeRow
                      ? 'bg-white shadow-sm ring-1 ring-[#dfe1f4]'
                      : 'hover:bg-white/70'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => switchSession(s.id)}
                    className="w-full pr-5 text-left"
                    title={s.title}
                  >
                    <p
                      className={`truncate text-[12px] font-semibold leading-snug ${
                        activeRow ? 'text-[#4f46e5]' : 'text-ink'
                      }`}
                    >
                      {s.title}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[#9aa0b8]">
                      {formatSessionTime(s.updatedAt)}
                    </p>
                  </button>
                  <button
                    type="button"
                    title="删除此会话"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteSession(s.id)
                    }}
                    className="absolute right-1 top-1.5 flex h-5 w-5 items-center justify-center rounded text-[#b0b5c9] opacity-0 transition hover:bg-[#fee2e2] hover:text-[#dc2626] group-hover:opacity-100"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              )
            })}
            {!sessions.some((s) => sessionHasUserContent(s)) && sessions.length <= 1 ? (
              <p className="px-2 pt-2 text-[11px] leading-relaxed text-[#9aa0b8]">
                新开对话后，有内容的会话会出现在这里。
              </p>
            ) : null}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ResizablePanelGroup
            orientation="vertical"
            className="min-h-0 flex-1"
            defaultLayout={aiSplit}
            onLayoutChanged={(layout) => {
              try {
                localStorage.setItem(AI_SPLIT_KEY, JSON.stringify(layout))
              } catch {
                /* ignore */
              }
            }}
          >
            <ResizablePanel id="messages" minSize="30" className="min-h-0">
              <div className="h-full min-h-0 space-y-3 overflow-y-auto px-3 py-3">
                {toast ? (
                  <div className="rounded-xl border border-[#c7c9ef] bg-[#eef0fb] px-3 py-2 text-[12px] text-[#4f46e5]">
                    {toast}
                  </div>
                ) : null}
                {msgs.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-[#4f46e5] text-white'
                          : 'border border-[#eceef6] bg-white text-ink shadow-sm'
                      }`}
                    >
                      {m.role === 'assistant' && (
                        <div className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-[#4f46e5]">
                          <Sparkles size={12} />
                          AI 解读
                          {m.streaming ? (
                            <Loader2 size={11} className="ml-0.5 animate-spin opacity-70" />
                          ) : null}
                        </div>
                      )}
                      {m.role === 'assistant' ? (
                        <>
                          {m.collapsed && !m.streaming ? (
                            <p className="text-[13px] leading-relaxed text-[#6a70a0]">
                              {previewText(m.text) || '（空消息）'}
                            </p>
                          ) : (
                            <AssistantMarkdown text={m.text} streaming={m.streaming} />
                          )}
                          {!m.streaming && m.id !== 'welcome' ? (
                            <BubbleActions
                              text={m.text}
                              collapsed={m.collapsed}
                              onToggle={() =>
                                setMsgs((prev) =>
                                  prev.map((x) =>
                                    x.id === m.id ? { ...x, collapsed: !x.collapsed } : x,
                                  ),
                                )
                              }
                              onCopiedToast={() => setToast('已复制到剪贴板')}
                              onImportToast={(ok) =>
                                setToast(ok ? '已导入到笔记（高亮块）' : '导入失败：笔记区未就绪')
                              }
                            />
                          ) : null}
                        </>
                      ) : (
                        <div className="space-y-2">
                          {m.quote ? (
                            <div
                              className="rounded-lg border border-white/25 bg-white/15 px-2.5 py-1.5 text-[11.5px] leading-snug text-white/90"
                              title={m.quote.text}
                            >
                              <span className="mr-1.5 font-semibold opacity-80">
                                {quoteSourceLabel(m.quote.source)}
                              </span>
                              {ellipsizeQuote(m.quote.text, 64)}
                            </div>
                          ) : null}
                          <p className="whitespace-pre-wrap">{m.text}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </ResizablePanel>

            <ResizableHandle className="h-1.5 w-full cursor-row-resize bg-[#eceef6] transition-colors duration-150 hover:bg-[#c7c9ef] data-[separator=active]:bg-[#a5a8e0]" />

            <ResizablePanel id="composer" minSize="18" className="min-h-0">
              <div className="flex h-full min-h-0 flex-col bg-white/80 px-3 py-2.5">
                <div className="flex min-h-0 flex-1 items-stretch gap-2">
                  <div
                    className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white transition ${
                      busy
                        ? 'border-[#e4e6f0] opacity-60'
                        : 'border-[#e4e6f0] focus-within:border-[#c7c9ef]'
                    }`}
                    onClick={() => textareaRef.current?.focus()}
                  >
                    {quote ? (
                      <div className="shrink-0 px-2.5 pt-2.5" onClick={(e) => e.stopPropagation()}>
                        <div
                          className="flex max-w-full items-center gap-1.5 rounded-lg border border-[#dfe2f5] bg-[#f3f4fb] py-1 pl-2 pr-1"
                          title={quote.text}
                        >
                          <Quote size={12} className="shrink-0 text-[#4f46e5]" />
                          <span className="shrink-0 text-[11px] font-semibold text-[#4f46e5]">
                            {quoteSourceLabel(quote.source)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12px] leading-snug text-[#4a5080]">
                            {ellipsizeQuote(quote.text, 56)}
                          </span>
                          <button
                            type="button"
                            title="取消导入"
                            onClick={() => {
                              setQuote(null)
                              textareaRef.current?.focus()
                            }}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[#8b91b3] transition hover:bg-white hover:text-ink"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          void send()
                        }
                        if (e.key === 'Escape' && quote) {
                          e.preventDefault()
                          setQuote(null)
                        }
                        if (
                          quote &&
                          (e.key === 'Backspace' || e.key === 'Delete') &&
                          !input &&
                          !e.ctrlKey &&
                          !e.metaKey &&
                          !e.altKey
                        ) {
                          e.preventDefault()
                          setQuote(null)
                        }
                      }}
                      disabled={busy}
                      placeholder={
                        quote
                          ? '针对摘录提问…（Enter 发送）'
                          : `向 AI 提问这篇文献…（选中 MD/译文后 ${quoteShortcutLabel} 导入）`
                      }
                      className="h-full min-h-0 flex-1 resize-none border-0 bg-transparent px-3 py-2.5 text-[13px] leading-relaxed text-ink outline-none placeholder:text-[#b0b5c9] disabled:cursor-not-allowed"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={!input.trim() || busy}
                    title="发送"
                    className="flex h-11 w-11 shrink-0 self-end items-center justify-center rounded-xl bg-[#4f46e5] text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  )
}
