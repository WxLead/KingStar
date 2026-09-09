import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Loader2, Plus, Send, Square } from 'lucide-react'
import {
  createAgentSession,
  confirmAgentTurn,
  deleteAgentArtifact,
  deleteAgentSession,
  interruptAgentSession,
  listAgentArtifacts,
  listAgentSessionEvents,
  listAgentSessions,
  patchAgentArtifact,
  runAgentTurnStream,
  truncateAgentFromTurn,
  type AgentArtifact,
  type AgentSessionSummary,
} from '@/services/api'
import { useUploads } from '@/features/uploads/UploadsContext'
import { loadSessionId, saveSessionId } from '@/features/agent/agentSessionStore'
import { AgentEmptyState } from '@/features/agent/AgentEmptyState'
import {
  ArtifactDrawerScrim,
  ArtifactPane,
  ArtifactPaneToggle,
} from '@/features/agent/ArtifactPane'
import { applyArtifactEvent, preferActiveId } from '@/features/agent/artifactState'
import { SessionSwitcher } from '@/features/agent/SessionSwitcher'
import { TodoDock } from '@/features/agent/TodoDock'
import { TurnBlock } from '@/features/agent/TurnBlock'
import { applyStreamEvent, groupNodesByTurn, nodesFromEvents } from '@/features/agent/timeline'
import { projectTodosFromNodes } from '@/features/agent/todoProjection'
import type { AgentChatNode } from '@/features/agent/types'
import ListPageHero from '@/features/layout/ListPageHero'
import { appAlert, appConfirm } from '@/features/ui/app-modal'

async function loadNodes(sessionId: string): Promise<AgentChatNode[]> {
  const { items: events } = await listAgentSessionEvents(sessionId)
  return nodesFromEvents(events)
}

async function loadArtifacts(sessionId: string): Promise<AgentArtifact[]> {
  try {
    const { items } = await listAgentArtifacts(sessionId)
    return items
  } catch {
    return []
  }
}

export default function AgentPage() {
  const { refresh } = useUploads()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([])
  const [goal, setGoal] = useState('')
  const [running, setRunning] = useState(false)
  const [turnId, setTurnId] = useState<string | null>(null)
  const [nodes, setNodes] = useState<AgentChatNode[]>([])
  const [artifacts, setArtifacts] = useState<AgentArtifact[]>([])
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null)
  /** null = auto (open when artifacts exist); false = user hid; true = user forced open */
  const [panePref, setPanePref] = useState<boolean | null>(null)
  const [ready, setReady] = useState(false)
  const [viewLoading, setViewLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  /** Invalidates in-flight SSE so it cannot mutate the transcript. */
  const streamGenRef = useRef(0)
  /** Invalidates async loadNodes / createSession results after switch / new. */
  const viewEpochRef = useRef(0)
  const listRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const goalRef = useRef(goal)
  const sessionRef = useRef(sessionId)
  const turnRef = useRef(turnId)
  goalRef.current = goal

  const todos = useMemo(() => projectTodosFromNodes(nodes), [nodes])
  const turnGroups = useMemo(() => groupNodesByTurn(nodes), [nodes])
  /** Auto-open when artifacts exist; user can hide (panePref=false) or force reopen (true). */
  const showArtifactPane = artifacts.length > 0 && panePref !== false

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
      setArtifacts([])
      setActiveArtifactId(null)
      setPanePref(null)
      setGoal('')
      setViewLoading(true)
      return epoch
    },
    [invalidateLive],
  )

  useEffect(() => {
    setActiveArtifactId((cur) => preferActiveId(artifacts, cur))
  }, [artifacts])

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
            setArtifacts(await loadArtifacts(sid))
            setPanePref(null)
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
        setArtifacts([])
        setPanePref(null)
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
        setArtifacts(await loadArtifacts(sid))
        setPanePref(null)
      } catch (err) {
        if (epoch !== viewEpochRef.current) return
        setNodes([
          {
            kind: 'error',
            id: `load-err-${Date.now()}`,
            message: err instanceof Error ? err.message : String(err),
          },
        ])
        setArtifacts([])
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
      setArtifacts([])
      setPanePref(null)
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
      const ok = await appConfirm({
        title: '删除会话',
        description: '删除该会话？对话记录将无法恢复。',
        confirmLabel: '删除',
        danger: true,
      })
      if (!ok) return
      const wasActive = sid === sessionRef.current
      if (wasActive) invalidateLive(sid)
      try {
        await deleteAgentSession(sid)
      } catch (err) {
        await appAlert(err instanceof Error ? err.message : String(err))
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

  const start = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? goalRef.current).trim()
    const sid = sessionRef.current
    const epoch = viewEpochRef.current
    if (!text || !sid) return

    // Interrupt in-flight turn, then send the new goal.
    if (runningRef.current) {
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
          if (ev.event === 'artifact_upsert' || ev.event === 'artifact_delta') {
            setArtifacts((prev) => applyArtifactEvent(prev, ev))
            // Keep hidden if user closed the pane; otherwise auto-show.
            setPanePref((p) => (p === false ? false : null))
          }
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
                setArtifacts(await loadArtifacts(sid))
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
  }, [refresh, refreshSessions, stop])

  const onConfirm = useCallback(async (item: AgentChatNode, approved: boolean) => {
    const sid = sessionRef.current
    if (!sid || item.kind !== 'confirm' || !item.confirmId) return
    const tid = item.turnId || turnRef.current
    if (!tid) return
    await confirmAgentTurn(sid, tid, item.confirmId, approved)
  }, [])

  const dropFromTurn = useCallback((turnId: string) => {
    setNodes((prev) => {
      const groups = groupNodesByTurn(prev)
      const idx = groups.findIndex((g) => g.key === turnId)
      if (idx < 0) return prev.filter((n) => n.turnId !== turnId)
      const drop = new Set(groups.slice(idx).map((g) => g.key))
      return prev.filter((n) => !n.turnId || !drop.has(n.turnId))
    })
  }, [])

  const rerunFromTurn = useCallback(
    async (turnId: string | undefined, text: string) => {
      const goal = text.trim()
      const sid = sessionRef.current
      if (!goal || !sid || !turnId) return

      if (runningRef.current) {
        await stop()
        await new Promise((r) => setTimeout(r, 400))
        if (sessionRef.current !== sid) return
      }

      try {
        await truncateAgentFromTurn(sid, turnId)
      } catch (err) {
        await appAlert(err instanceof Error ? err.message : String(err))
        return
      }
      dropFromTurn(turnId)
      await start(goal)
    },
    [dropFromTurn, start, stop],
  )

  const rewriteUser = useCallback(
    (turnId: string | undefined, text: string) => {
      void rerunFromTurn(turnId, text)
    },
    [rerunFromTurn],
  )

  const regenerateTurn = useCallback(
    (turnId?: string) => {
      if (!turnId || runningRef.current) return
      const user = nodes.find((n) => n.kind === 'user' && n.turnId === turnId)
      const text = user && user.kind === 'user' ? user.text.trim() : ''
      if (!text) return
      void rerunFromTurn(turnId, text)
    },
    [nodes, rerunFromTurn],
  )

  const pickExample = useCallback((prompt: string) => {
    setGoal(prompt)
    window.requestAnimationFrame(() => {
      const el = composerRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(prompt.length, prompt.length)
    })
  }, [])

  const onComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    void start()
  }

  const renameArtifact = useCallback(async (id: string, title: string) => {
    const sid = sessionRef.current
    if (!sid) return
    try {
      const { artifact } = await patchAgentArtifact(sid, id, { title })
      setArtifacts((prev) => prev.map((a) => (a.artifact_id === id ? { ...a, ...artifact } : a)))
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const setArtifactStatus = useCallback(async (id: string, status: string) => {
    const sid = sessionRef.current
    if (!sid) return
    try {
      const { artifact } = await patchAgentArtifact(sid, id, { status })
      setArtifacts((prev) => prev.map((a) => (a.artifact_id === id ? { ...a, ...artifact } : a)))
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const removeArtifact = useCallback(async (id: string) => {
    const sid = sessionRef.current
    if (!sid) return
    const target = artifacts.find((a) => a.artifact_id === id)
    const ok = await appConfirm({
      title: '删除产物',
      description: `删除「${target?.title || '未命名产物'}」？此操作不可恢复。`,
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteAgentArtifact(sid, id)
      setArtifacts((prev) => {
        const next = prev.filter((a) => a.artifact_id !== id)
        if (next.length === 0) setPanePref(null)
        return next
      })
      setActiveArtifactId((cur) => (cur === id ? null : cur))
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : String(err))
    }
  }, [artifacts])

  return (
    <div className="relative z-10 flex h-full min-h-0 flex-col">
      <ListPageHero
        title="研究助手"
        icon={<Bot size={20} strokeWidth={2} />}
        action={
          <>
            {artifacts.length > 0 && !showArtifactPane ? (
              <ArtifactPaneToggle count={artifacts.length} onOpen={() => setPanePref(true)} />
            ) : null}
            <SessionSwitcher
              sessions={sessions}
              activeId={sessionId}
              disabled={viewLoading}
              onSelect={(id) => void switchSession(id)}
              onDelete={(id) => void deleteSession(id)}
            />
            <button
              type="button"
              onClick={() => void newSession()}
              disabled={viewLoading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#e4e6f0] bg-white px-3 py-2 text-[13px] font-semibold text-[#6a70a0] transition hover:border-[#c7d2fe] hover:text-[#4176e6] disabled:opacity-40"
            >
              <Plus size={14} />
              新会话
            </button>
          </>
        }
      />

      <div
        className={`relative mx-auto flex min-h-0 w-full min-w-0 flex-1 gap-3 ${
          showArtifactPane ? 'max-w-[1200px] flex-row' : 'max-w-[820px] flex-col'
        }`}
      >
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col ${showArtifactPane ? '' : ''}`}
        >
          <div
            key={sessionId ?? 'none'}
            ref={listRef}
            className={`min-h-0 flex-1 rounded-2xl border border-[#e4e8f0] shadow-sm ${
              ready && !viewLoading && nodes.length === 0
                ? 'overflow-hidden bg-[#f7f9fd] p-0'
                : 'overflow-y-auto bg-white/90 px-5 py-5 sm:px-6'
            }`}
          >
            {!ready || viewLoading ? (
              <p className="flex items-center justify-center gap-2 py-16 text-[14px] text-[#9aa0b8]">
                <Loader2 className="animate-spin" size={16} />
                {viewLoading ? '切换会话…' : '加载会话…'}
              </p>
            ) : nodes.length === 0 ? (
              <AgentEmptyState onPick={pickExample} />
            ) : (
              <div className="space-y-8">
                {turnGroups.map((g) => (
                  <TurnBlock
                    key={g.key}
                    nodes={g.nodes}
                    running={running && Boolean(turnId && g.key === turnId)}
                    defaultCollapsed={g.settled}
                    onConfirm={onConfirm}
                    onRewrite={rewriteUser}
                    onRegenerate={regenerateTurn}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 shrink-0">
            <TodoDock todos={todos} />
            <div className="rounded-2xl border border-[#e4e8f0] bg-white p-3 shadow-sm focus-within:border-[#c7d2fe] focus-within:ring-2 focus-within:ring-[#e8f0ff]">
              <div className="flex items-center gap-2">
                <textarea
                  ref={composerRef}
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
                  className="min-h-[72px] flex-1 resize-none rounded-xl border-0 bg-transparent px-2 py-2 text-[15px] text-ink outline-none placeholder:text-[#b0b5c9] disabled:opacity-60"
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

        {showArtifactPane ? (
          <>
            <div className="relative hidden min-h-0 w-[min(42%,440px)] shrink-0 md:flex md:flex-col">
              <ArtifactPane
                className="h-full"
                artifacts={artifacts}
                activeId={activeArtifactId}
                onSelect={setActiveArtifactId}
                onHide={() => setPanePref(false)}
                onRename={renameArtifact}
                onDelete={removeArtifact}
                onSetStatus={setArtifactStatus}
              />
            </div>
            <div className="md:hidden">
              <ArtifactDrawerScrim onClose={() => setPanePref(false)} />
              <ArtifactPane
                overlay
                artifacts={artifacts}
                activeId={activeArtifactId}
                onSelect={setActiveArtifactId}
                onHide={() => setPanePref(false)}
                onRename={renameArtifact}
                onDelete={removeArtifact}
                onSetStatus={setArtifactStatus}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
