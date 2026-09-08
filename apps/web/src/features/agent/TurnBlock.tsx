import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, Loader2, X } from 'lucide-react'
import { AgentMarkdown } from './AgentMarkdown'
import { CopyTextButton } from './CopyTextButton'
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
      className="flex items-center gap-2 rounded-xl border border-[#e4e8f0] bg-[#f7f9fd] px-3 py-2 text-[13px] text-[#5a6486]"
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

function NodeView({
  node,
  running,
  onConfirm,
}: {
  node: AgentChatNode
  running: boolean
  onConfirm?: (node: AgentChatNode, approved: boolean) => void
}): ReactNode {
  if (node.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[72%]">
          <div className="select-text rounded-[22px] bg-[#e8f0ff] px-4 py-2.5 text-[14px] leading-relaxed text-[#1e2a52] whitespace-pre-wrap break-words">
            {node.text}
          </div>
          <div className="mt-1 flex justify-end">
            <CopyTextButton text={node.text} />
          </div>
        </div>
      </div>
    )
  }
  if (node.kind === 'assistant') {
    return (
      <div className="min-w-0 select-text">
        <AgentMarkdown text={node.text} streaming={node.streaming} />
        {!node.streaming && !running && node.text.trim() ? (
          <div className="mt-1.5 flex">
            <CopyTextButton text={node.text} />
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
      <div className="flex h-7 items-center gap-2 px-1.5 text-[13px] text-[#8b91b3]">
        <span className="font-medium text-[#5a6486]">{node.title}</span>
        <span className="h-0.5 w-0.5 rounded-full bg-[#b0b7cc]" />
        <span className="truncate">{node.message}</span>
      </div>
    )
  }
  if (node.kind === 'error') {
    return (
      <div className="rounded-xl border border-[#fecaca] bg-[#fff7f7] px-3 py-2 text-[13px] text-[#b91c1c]">
        {node.message || '错误'}
      </div>
    )
  }
  if (node.kind === 'confirm') {
    return (
      <div className="rounded-xl border border-[#c7d2fe] bg-[#f5f7ff] px-3 py-2">
        <div className="text-[12px] font-semibold text-[#8b91b3]">需要确认</div>
        <div className="mt-1 text-[13px] text-ink">{node.message}</div>
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
}: {
  nodes: AgentChatNode[]
  running: boolean
  defaultCollapsed: boolean
  onConfirm?: (node: AgentChatNode, approved: boolean) => void
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

  return (
    <div className="space-y-3">
      {parts.leading.map((n) => (
        <NodeView key={n.id} node={n} running={running} onConfirm={onConfirm} />
      ))}

      {showFold ? (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] text-[#7a849f] transition hover:bg-[#f0f3fa] hover:text-[#3a4568]"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <span>{processLabel(parts.process, settled, running)}</span>
            {running ? <Loader2 size={12} className="animate-spin text-[#4176e6]" /> : null}
          </button>
          {!collapsed ? (
            <div className="space-y-0.5 border-l border-[#e8ecf4] pl-2">
              {parts.process.map((n) => (
                <NodeView key={n.id} node={n} running={running} onConfirm={onConfirm} />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        parts.process.map((n) => <NodeView key={n.id} node={n} running={running} onConfirm={onConfirm} />)
      )}

      {parts.answers.map((n) => (
        <NodeView key={n.id} node={n} running={running} onConfirm={onConfirm} />
      ))}
      {showWorking ? <WorkingIndicator toolRunning={toolRunning} /> : null}
      {parts.trailing.map((n) => (
        <NodeView key={n.id} node={n} running={running} onConfirm={onConfirm} />
      ))}
    </div>
  )
}

// silence unused helper lint if tree-shaken oddly
void isProcessNode
