import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, Loader2, Pencil, RefreshCw, X } from 'lucide-react'
import { AgentMarkdown } from './AgentMarkdown'
import { CopyTextButton } from './CopyTextButton'
import { MessageIconButton } from './MessageIconButton'
import { ToolDisclosureRow } from './ToolDisclosureRow'
import type { AgentChatNode } from './types'

function isProcessNode(n: AgentChatNode): boolean {
  return n.kind === 'tool' || n.kind === 'progress' || (n.kind === 'assistant' && Boolean(n.streaming === false && false))
}

/** Nodes that collapse behind the turn-process control (tools / progress / intermediate). */
export function partitionTurnNodes(nodes: AgentChatNode[]): {
  leading: AgentChatNode[]
  process: AgentChatNode[]
  answers: AgentChatNode[]
  trailing: AgentChatNode[]
} {
  const leading: AgentChatNode[] = []
  const process: AgentChatNode[] = []
  const answers: AgentChatNode[] = []
  const trailing: AgentChatNode[] = []

  const assistants = nodes.filter((n) => n.kind === 'assistant')
  const lastAssistantId = assistants.length ? assistants[assistants.length - 1].id : null

  for (const n of nodes) {
    if (n.kind === 'user' || n.kind === 'confirm') {
      leading.push(n)
      continue
    }
    if (n.kind === 'error' || n.kind === 'turn_end') {
      trailing.push(n)
      continue
    }
    if (n.kind === 'tool' || n.kind === 'progress') {
      process.push(n)
      continue
    }
    if (n.kind === 'assistant') {
      if (n.streaming || n.id === lastAssistantId) answers.push(n)
      else process.push(n)
    }
  }
  return { leading, process, answers, trailing }
}

function processLabel(process: AgentChatNode[], settled: boolean, turnRunning: boolean): string {
  const tools = process.filter((n) => n.kind === 'tool').length
  const toolRunning = process.some((n) => n.kind === 'tool' && n.state === 'running')
  if (turnRunning || (!settled && toolRunning)) {
    if (toolRunning) return `执行中 · ${tools} 个工具`
    if (tools > 0) return `执行中 · 已完成 ${tools} 个工具`
    return '执行中'
  }
  if (tools > 0) return `过程 · ${tools} 个工具调用`
  if (process.length > 0) return `过程 · ${process.length} 步`
  return '过程'
}

function WorkingIndicator({ toolRunning }: { toolRunning: boolean }) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl border border-[#e4e8f0] bg-[#f7f9fd] px-3 py-2 text-[14px] text-[#5a6486]"
      aria-live="polite"
    >
      <Loader2 size={14} className="shrink-0 animate-spin text-[#4176e6]" />
      <span className="font-medium text-[#3a4568]">
        {toolRunning ? '正在调用工具…' : '正在思考下一步…'}
      </span>
      <span className="ml-0.5 inline-flex items-center gap-1" aria-hidden>
        <span className="h-1 w-1 animate-pulse rounded-full bg-[#4176e6] [animation-delay:0ms]" />
        <span className="h-1 w-1 animate-pulse rounded-full bg-[#4176e6] [animation-delay:160ms]" />
        <span className="h-1 w-1 animate-pulse rounded-full bg-[#4176e6] [animation-delay:320ms]" />
      </span>
    </div>
  )
}

function UserMessageBubble({
  node,
  running,
  onRewrite,
}: {
  node: Extract<AgentChatNode, { kind: 'user' }>
  running: boolean
  onRewrite?: (turnId: string | undefined, text: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(node.text)
  const [submitting, setSubmitting] = useState(false)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!editing) setDraft(node.text)
  }, [editing, node.text])

  useEffect(() => {
    if (!editing) return
    const el = taRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [editing])

  const cancel = () => {
    setDraft(node.text)
    setEditing(false)
  }

  const submit = () => {
    const text = draft.trim()
    if (!text || !onRewrite || submitting) return
    setSubmitting(true)
    onRewrite(node.turnId, text)
    setEditing(false)
    setSubmitting(false)
  }

  if (editing) {
    return (
      <div className="flex justify-end">
        <div className="w-full max-w-[72%]">
          <textarea
            ref={taRef}
            value={draft}
            rows={2}
            disabled={submitting}
            onChange={(e) => {
              setDraft(e.target.value)
              const el = e.target
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 220)}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                cancel()
                return
              }
              if (e.key !== 'Enter' || e.shiftKey) return
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              e.preventDefault()
              submit()
            }}
            className="w-full resize-none rounded-[22px] border border-[#c7d2fe] bg-[#e8f0ff] px-4 py-2.5 text-[15px] leading-relaxed text-[#1e2a52] outline-none ring-2 ring-[#e8f0ff] focus:border-[#4176e6]"
          />
          <div className="mt-0.5 flex h-7 items-center justify-end gap-0.5">
            <MessageIconButton title="取消" onClick={cancel}>
              <X size={14} />
            </MessageIconButton>
            <MessageIconButton
              title="发送重写"
              disabled={!draft.trim() || submitting}
              onClick={submit}
            >
              <Check size={14} />
            </MessageIconButton>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex justify-end">
      <div className="max-w-[72%]">
        <div className="select-text rounded-[22px] bg-[#e8f0ff] px-4 py-2.5 text-[15px] leading-relaxed text-[#1e2a52] whitespace-pre-wrap break-words">
          {node.text}
        </div>
        <div className="mt-0.5 flex h-7 items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <CopyTextButton text={node.text} />
          {onRewrite ? (
            <MessageIconButton
              title="重写"
              disabled={running}
              onClick={() => {
                setDraft(node.text)
                setEditing(true)
              }}
            >
              <Pencil size={14} />
            </MessageIconButton>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function NodeView({
  node,
  running,
  onConfirm,
  onRewrite,
  onRegenerate,
}: {
  node: AgentChatNode
  running: boolean
  onConfirm?: (node: AgentChatNode, approved: boolean) => void
  onRewrite?: (turnId: string | undefined, text: string) => void
  onRegenerate?: (turnId?: string) => void
}): ReactNode {
  if (node.kind === 'user') {
    return <UserMessageBubble node={node} running={running} onRewrite={onRewrite} />
  }
  if (node.kind === 'assistant') {
    return (
      <div className="group min-w-0 select-text">
        <AgentMarkdown text={node.text} streaming={node.streaming} />
        {!node.streaming && !running && node.text.trim() ? (
          <div className="mt-0.5 flex h-7 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <CopyTextButton text={node.text} />
            {onRegenerate ? (
              <MessageIconButton title="重新生成" onClick={() => onRegenerate(node.turnId)}>
                <RefreshCw size={14} />
              </MessageIconButton>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }
  if (node.kind === 'tool') {
    return (
      <ToolDisclosureRow
        title={node.title}
        summary={node.summary}
        state={node.state}
        bodyRaw={JSON.stringify(node.arguments ?? {}, null, 2)}
        output={node.resultText}
      />
    )
  }
  if (node.kind === 'progress') {
    return (
      <div className="flex h-7 items-center gap-2 px-1.5 text-[14px] text-[#8b91b3]">
        <span className="font-medium text-[#5a6486]">{node.title}</span>
        <span className="h-0.5 w-0.5 rounded-full bg-[#b0b7cc]" />
        <span className="truncate">{node.message}</span>
      </div>
    )
  }
  if (node.kind === 'error') {
    return (
      <div className="rounded-xl border border-[#fecaca] bg-[#fff7f7] px-3 py-2 text-[14px] text-[#b91c1c]">
        {node.message || '错误'}
      </div>
    )
  }
  if (node.kind === 'confirm') {
    return (
      <div className="rounded-xl border border-[#c7d2fe] bg-[#f5f7ff] px-3 py-2">
        <div className="text-[13px] font-semibold text-[#8b91b3]">需要确认</div>
        <div className="mt-1 text-[14px] text-ink">{node.message}</div>
        {running && onConfirm ? (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onConfirm(node, true)}
              className="inline-flex items-center gap-1 rounded-lg bg-[#4176e6] px-3 py-1.5 text-[13px] font-semibold text-white"
            >
              <Check size={14} />
              继续
            </button>
            <button
              type="button"
              onClick={() => onConfirm(node, false)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#e4e6f0] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#6a70a0]"
            >
              <X size={14} />
              拒绝
            </button>
          </div>
        ) : null}
      </div>
    )
  }
  if (node.kind === 'turn_end') {
    return (
      <div className="pt-1 text-[11px] text-[#b0b5c9]">
        {node.status === 'done' ? '已完成' : `结束 · ${node.status}`}
      </div>
    )
  }
  return null
}

export function TurnBlock({
  nodes,
  running,
  defaultCollapsed,
  onConfirm,
  onRewrite,
  onRegenerate,
}: {
  nodes: AgentChatNode[]
  running: boolean
  defaultCollapsed: boolean
  onConfirm?: (node: AgentChatNode, approved: boolean) => void
  onRewrite?: (turnId: string | undefined, text: string) => void
  onRegenerate?: (turnId?: string) => void
}) {
  const parts = useMemo(() => partitionTurnNodes(nodes), [nodes])
  const settled =
    parts.trailing.some((n) => n.kind === 'turn_end') ||
    (!running && parts.process.every((n) => n.kind !== 'tool' || n.state !== 'running'))
  const [collapsed, setCollapsed] = useState(defaultCollapsed && parts.process.length > 0 && !running)

  const toolRunning = parts.process.some((n) => n.kind === 'tool' && n.state === 'running')
  const streaming = parts.answers.some((n) => n.kind === 'assistant' && n.streaming)
  const showWorking = running && !settled && !streaming

  useEffect(() => {
    if (running) setCollapsed(false)
  }, [running])

  useEffect(() => {
    if (settled && defaultCollapsed && parts.process.length > 0) setCollapsed(true)
  }, [settled, defaultCollapsed, parts.process.length])

  const showFold =
    parts.process.length > 0 &&
    (parts.answers.length > 0 || parts.trailing.some((n) => n.kind === 'turn_end') || running)

  const nodeProps = { running, onConfirm, onRewrite, onRegenerate }

  return (
    <div className="space-y-3">
      {parts.leading.map((n) => (
        <NodeView key={n.id} node={n} {...nodeProps} />
      ))}

      {showFold ? (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[14px] text-[#7a849f] transition hover:bg-[#f0f3fa] hover:text-[#3a4568]"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <span>{processLabel(parts.process, settled, running)}</span>
            {running ? <Loader2 size={12} className="animate-spin text-[#4176e6]" /> : null}
          </button>
          {!collapsed ? (
            <div className="space-y-0.5 border-l border-[#e8ecf4] pl-2">
              {parts.process.map((n) => (
                <NodeView key={n.id} node={n} {...nodeProps} />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        parts.process.map((n) => <NodeView key={n.id} node={n} {...nodeProps} />)
      )}

      {parts.answers.map((n) => (
        <NodeView key={n.id} node={n} {...nodeProps} />
      ))}
      {showWorking ? <WorkingIndicator toolRunning={toolRunning} /> : null}
      {parts.trailing.map((n) => (
        <NodeView key={n.id} node={n} {...nodeProps} />
      ))}
    </div>
  )
}

// silence unused helper lint if tree-shaken oddly
void isProcessNode
