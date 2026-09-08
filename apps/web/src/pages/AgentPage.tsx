import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Loader2, Plus, Send, Square, Sparkles } from 'lucide-react'
import {
  createAgentSession,
  confirmAgentTurn,
  deleteAgentSession,
  interruptAgentSession,
  listAgentSessionEvents,
  listAgentSessions,
  runAgentTurnStream,
  type AgentSessionSummary,
} from '@/services/api'
import { useUploads } from '@/features/uploads/UploadsContext'
import { loadSessionId, saveSessionId } from '@/features/agent/agentSessionStore'
import { SessionSwitcher } from '@/features/agent/SessionSwitcher'
import { TodoDock } from '@/features/agent/TodoDock'
import { TurnBlock } from '@/features/agent/TurnBlock'
import { applyStreamEvent, groupNodesByTurn, nodesFromEvents } from '@/features/agent/timeline'
import { projectTodosFromNodes } from '@/features/agent/todoProjection'
import type { AgentChatNode } from '@/features/agent/types'

const EXAMPLES = [
  '检查 MinerU 和 LLM 是否就绪',
  '在文献库搜索 transformer，列出最近几篇',
  '调研长上下文 Transformer 近期进展：网上找相关论文，挑一篇入库并解析，写中文要点',
  '把 https://arxiv.org/abs/1706.03762 入库并解析（先不翻译）',
]

async function loadNodes(sessionId: string): Promise<AgentChatNode[]> {
  const { items: events } = await listAgentSessionEvents(sessionId)
  return nodesFromEvents(events)
}

export default function AgentPage() {
  const { refresh } = useUploads()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([])
  const [goal, setGoal] = useState('')
  const [running, setRunning] = useState(false)
  const [turnId, setTurnId] = useState<string | null>(null)
  const [nodes, setNodes] = useState<AgentChatNode[]>([])
  const [ready, setReady] = useState(false)
  const [viewLoading, setViewLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  /** Invalidates in-flight SSE so it cannot mutate the transcript. */
  const streamGenRef = useRef(0)
  /** Invalidates async loadNodes / createSession results after switch / new. */
  const viewEpochRef = useRef(0)
  const listRef = useRef<HTMLDivElement | null>(null)
  const goalRef = useRef(goal)
  const sessionRef = useRef(sessionId)
  const turnRef = useRef(turnId)
  goalRef.current = goal

  const todos = useMemo(() => projectTodosFromNodes(nodes), [nodes])
  const turnGroups = useMemo(() => groupNodesByTurn(nodes), [nodes])

  const refreshSessions = useCallback(async () => {
    try {
      const { items: list } = await listAgentSessions(40)
      setSessions(list)
    } catch {
      /* ignore */
    }
  }, [])

  const runningRef = useRef(false)
  runningRef.current = running

  /** Drop live stream. Only hard-interrupt the BFF when a turn is actually running. */
  const invalidateLive = useCallback((interruptSid?: string | null) => {
    streamGenRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    const wasRunning = runningRef.current
    setRunning(false)
    setTurnId(null)
    turnRef.current = null
    if (wasRunning && interruptSid) {
      void interruptAgentSession(interruptSid).catch(() => {
        /* local abort already applied */
      })
    }
  }, [])

  /** Begin a session view change: invalidate streams, bump view epoch, clear transcript. */
  const beginViewChange = useCallback(
    (nextSid: string | null) => {
      const prevSid = sessionRef.current
      invalidateLive(prevSid)
      const epoch = ++viewEpochRef.current
      sessionRef.current = nextSid
      setSessionId(nextSid)
      saveSessionId(nextSid)
      setNodes([])
      setGoal('')
      setViewLoading(true)
      return epoch
    },
    [invalidateLive],
  )

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [nodes, sessionId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await refreshSessions()
        let sid = loadSessionId()
        if (sid) {
          try {
            const restored = await loadNodes(sid)
            if (cancelled) return
            sessionRef.current = sid
            setSessionId(sid)
            setNodes(restored)
            setReady(true)
            void refreshSessions()
            return
          } catch {
            sid = null
            saveSessionId(null)
          }
        }
        const created = await createAgentSession()
        if (cancelled) return
        sessionRef.current = created.session_id
        setSessionId(created.session_id)
        saveSessionId(created.session_id)
        setNodes([])
        await refreshSessions()
      } catch (err) {
        if (!cancelled) {
          setNodes([
            {
              kind: 'error',
              id: 'boot-err',
              message: err instanceof Error ? err.message : String(err),
            },
          ])
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshSessions])

  const stop = useCallback(async () => {
    const sid = sessionRef.current
    const epoch = viewEpochRef.current
    streamGenRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setRunning(false)
    setTurnId(null)
    turnRef.current = null
    if (epoch === viewEpochRef.current) {
      setNodes((prev) =>
        prev.map((n) => (n.kind === 'assistant' && n.streaming ? { ...n, streaming: false } : n)),
      )
    }
    if (sid) {
      try {
        await interruptAgentSession(sid)
      } catch {
        /* local abort already applied */
      }
    }
  }, [])

  const switchSession = useCallback(
    async (sid: string) => {
      if (sid === sessionRef.current) return
      const epoch = beginViewChange(sid)
      try {
        const restored = await loadNodes(sid)
        if (epoch !== viewEpochRef.current || sessionRef.current !== sid) return
        setNodes(restored)
      } catch (err) {
        if (epoch !== viewEpochRef.current) return
        setNodes([
          {
            kind: 'error',
            id: `load-err-${Date.now()}`,
            message: err instanceof Error ? err.message : String(err),
          },
        ])
      } finally {
        if (epoch === viewEpochRef.current) setViewLoading(false)
      }
    },
    [beginViewChange],
  )

  const newSession = useCallback(async () => {
    const epoch = beginViewChange(null)
    try {
      const created = await createAgentSession()
      if (epoch !== viewEpochRef.current) return
      sessionRef.current = created.session_id
      setSessionId(created.session_id)
      saveSessionId(created.session_id)
      setNodes([])
      await refreshSessions()
    } catch (err) {
      if (epoch !== viewEpochRef.current) return
      setNodes([
        {
          kind: 'error',
          id: `new-err-${Date.now()}`,
          message: err instanceof Error ? err.message : String(err),
        },
      ])
    } finally {
      if (epoch === viewEpochRef.current) setViewLoading(false)
    }
  }, [beginViewChange, refreshSessions])

  const deleteSession = useCallback(
    async (sid: string) => {
      const ok = window.confirm('删除该会话？对话记录将无法恢复。')
      if (!ok) return
      const wasActive = sid === sessionRef.current
      if (wasActive) invalidateLive(sid)
      try {
        await deleteAgentSession(sid)
      } catch (err) {
        window.alert(err instanceof Error ? err.message : String(err))
        return
      }
      const remaining = sessions.filter((s) => s.session_id !== sid)
      if (wasActive) {
        if (remaining.length > 0) {
          await switchSession(remaining[0].session_id)
        } else {
          await newSession()
          return
        }
      }
      await refreshSessions()
    },
    [invalidateLive, newSession, refreshSessions, sessions, switchSession],
  )

  const start = useCallback(async () => {
    const text = goalRef.current.trim()
    const sid = sessionRef.current
    const epoch = viewEpochRef.current
    if (!text || !sid) return

    // Interrupt in-flight turn, then send the new goal.
    if (running) {
      await stop()
      await new Promise((r) => setTimeout(r, 400))
      // User may have switched sessions while we were stopping.
      if (viewEpochRef.current !== epoch || sessionRef.current !== sid) return
    }

    const gen = ++streamGenRef.current
    const ac = new AbortController()
    abortRef.current = ac
    setRunning(true)
    setTurnId(null)
    turnRef.current = null
    setGoal('')

    const stillThisView = () =>
      gen === streamGenRef.current &&
      epoch === viewEpochRef.current &&
      sessionRef.current === sid

    try {
      const tid = await runAgentTurnStream(sid, text, {
        signal: ac.signal,
        onEvent: (ev) => {
          if (!stillThisView()) return
          if (ev.session_id && ev.session_id !== sid) return
          if (ev.turn_id) {
            turnRef.current = ev.turn_id
            setTurnId(ev.turn_id)
          }
          setNodes((prev) => applyStreamEvent(prev, ev))
          if (ev.event === 'tool_result') void refresh()
          if (ev.event === 'turn_end') {
            void refreshSessions()
            if (ev.status === 'cancelled') setRunning(false)
            // Reconcile from durable log — live SSE can miss/mis-merge the final answer.
            void (async () => {
              try {
                const restored = await loadNodes(sid)
                if (!stillThisView()) return
                setNodes(restored)
              } catch {
                /* keep streamed nodes */
              }
            })()
          }
        },
      })
      if (stillThisView() && tid) {
        turnRef.current = tid
        setTurnId(tid)
      }
    } catch (err) {
      if (!stillThisView()) return
      if ((err as Error).name === 'AbortError') {
        setNodes((prev) => [...prev, { kind: 'error', id: `abort-${Date.now()}`, message: '已中断' }])
      } else {
        setNodes((prev) => [
          ...prev,
          {
            kind: 'error',
            id: `err-${Date.now()}`,
            message: err instanceof Error ? err.message : String(err),
          },
        ])
      }
    } finally {
      if (stillThisView()) {
        setRunning(false)
        abortRef.current = null
        void refreshSessions()
      }
    }
  }, [refresh, refreshSessions, running, stop])

  const onConfirm = useCallback(async (item: AgentChatNode, approved: boolean) => {
    const sid = sessionRef.current
    if (!sid || item.kind !== 'confirm' || !item.confirmId) return
    const tid = item.turnId || turnRef.current
    if (!tid) return
    await confirmAgentTurn(sid, tid, item.confirmId, approved)
  }, [])

  const onComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    void start()
  }

  return (
    <div className="relative z-10 flex h-full min-h-0 flex-col">
      <header className="mb-4 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#e8f0ff] text-[#4176e6]">
              <Bot size={20} />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-[24px] leading-tight text-ink">研究助手</h1>
              <div className="mt-1.5">
                <SessionSwitcher
                  sessions={sessions}
                  activeId={sessionId}
                  disabled={viewLoading}
                  onSelect={(id) => void switchSession(id)}
                  onNew={() => void newSession()}
                  onDelete={(id) => void deleteSession(id)}
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void newSession()}
            disabled={viewLoading}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#e4e6f0] bg-white px-3 py-2 text-[13px] font-semibold text-[#6a70a0] transition hover:border-[#c7d2fe] hover:text-[#4176e6] disabled:opacity-40"
          >
            <Plus size={14} />
            新会话
          </button>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[820px] min-w-0 flex-1 flex-col">
        <div
          key={sessionId ?? 'none'}
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-[#e4e8f0] bg-white/90 px-5 py-5 shadow-sm sm:px-6"
        >
          {!ready || viewLoading ? (
            <p className="flex items-center justify-center gap-2 py-16 text-[14px] text-[#9aa0b8]">
              <Loader2 className="animate-spin" size={16} />
              {viewLoading ? '切换会话…' : '加载会话…'}
            </p>
          ) : nodes.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
              <Sparkles className="mb-3 text-[#4176e6]" size={28} />
              <p className="max-w-md text-[15px] text-[#6a70a0]">
                描述研究目标。助手会用 web / todo / 子代理调研，并用文献工具入库与解析。
              </p>
              <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setGoal(ex)}
                    className="rounded-full border border-[#e4e8f0] bg-[#f7f9fd] px-3 py-1.5 text-left text-[13px] text-[#4176e6] transition hover:border-[#c7d2fe] hover:bg-white"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {turnGroups.map((g) => (
                <TurnBlock
                  key={g.key}
                  nodes={g.nodes}
                  running={running && Boolean(turnId && g.key === turnId)}
                  defaultCollapsed={g.settled}
                  onConfirm={onConfirm}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 shrink-0">
          <TodoDock todos={todos} />
          <div className="rounded-2xl border border-[#e4e8f0] bg-white p-3 shadow-sm focus-within:border-[#c7d2fe] focus-within:ring-2 focus-within:ring-[#e8f0ff]">
            <div className="flex items-end gap-2">
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={onComposerKeyDown}
                rows={3}
                placeholder={
                  running
                    ? '输入新目标将先中断当前执行再发送…'
                    : '输入目标后按 Enter 发送（Shift+Enter 换行）…'
                }
                disabled={!sessionId}
                className="min-h-[72px] flex-1 resize-none rounded-xl border-0 bg-transparent px-2 py-2 text-[14px] text-ink outline-none placeholder:text-[#b0b5c9] disabled:opacity-60"
              />
              {running && !goal.trim() ? (
                <button
                  type="button"
                  onClick={() => void stop()}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#111827] px-4 text-[14px] font-semibold text-white transition hover:bg-black"
                >
                  <Square size={16} />
                  停止
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void start()}
                  disabled={!goal.trim() || !sessionId}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#4176e6] px-4 text-[14px] font-semibold text-white transition hover:bg-[#3566d4] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send size={16} />
                  {running ? '中断并发送' : '发送'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
