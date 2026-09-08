import type { AgentStreamEvent } from '@/services/api'
import { displayToolName, formatToolResult, summarizeToolArgs } from './toolSummary'
import type { AgentChatNode } from './types'

export function eventToNode(
  type: string,
  payload: Record<string, unknown>,
  seq: number,
  turnId?: string,
): AgentChatNode | null {
  const id = `e-${seq}`
  const tid = turnId || (typeof payload.turn_id === 'string' ? payload.turn_id : undefined)

  if (type === 'user_message') {
    return {
      kind: 'user',
      id,
      text: String(payload.content || payload.goal || ''),
      turnId: tid,
    }
  }
  if (type === 'assistant_message') {
    return {
      kind: 'assistant',
      id,
      text: String(payload.content || ''),
      turnId: tid,
      step: typeof payload.step === 'number' ? payload.step : undefined,
    }
  }
  if (type === 'tool_call') {
    const tool = String(payload.tool || '')
    const args = (payload.arguments as Record<string, unknown>) || {}
    return {
      kind: 'tool',
      id,
      tool,
      title: displayToolName(tool),
      summary: summarizeToolArgs(tool, args),
      arguments: args,
      state: 'running',
      turnId: tid,
      toolCallId: String(payload.tool_call_id || ''),
    }
  }
  if (type === 'tool_result') {
    const tool = String(payload.tool || '')
    const result = payload.result
    const ok = Boolean(
      payload.ok ?? (result && typeof result === 'object' && (result as { ok?: boolean }).ok !== false),
    )
    const args = (payload.arguments as Record<string, unknown>) || {}
    return {
      kind: 'tool',
      id,
      tool,
      title: displayToolName(tool),
      summary: summarizeToolArgs(tool, args) || (ok ? '完成' : '失败'),
      arguments: args,
      resultText: formatToolResult(result ?? payload),
      state: ok ? 'ok' : 'error',
      turnId: tid,
      toolCallId: String(payload.tool_call_id || ''),
    }
  }
  if (type === 'job_progress') {
    return {
      kind: 'progress',
      id,
      title: String(payload.tool || '任务'),
      message: String(payload.message || '进行中…'),
      turnId: tid,
    }
  }
  if (type === 'needs_confirm') {
    return {
      kind: 'confirm',
      id,
      message: String(payload.message || ''),
      confirmId: String(payload.confirm_id || ''),
      tool: String(payload.tool || ''),
      turnId: tid,
    }
  }
  if (type === 'error') {
    return { kind: 'error', id, message: String(payload.message || ''), turnId: tid }
  }
  if (type === 'turn_end') {
    return { kind: 'turn_end', id, status: String(payload.status || 'done'), turnId: tid }
  }
  return null
}

/** Merge a live stream event into the node list (pair tool_call / tool_result). */
export function applyStreamEvent(nodes: AgentChatNode[], ev: AgentStreamEvent): AgentChatNode[] {
  const turnId = ev.turn_id
  const idBase = `${ev.event}-${ev.seq ?? Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  if (ev.event === 'assistant_delta' && ev.content) {
    const step = ev.step
    const idx = [...nodes]
      .map((n, i) => ({ n, i }))
      .reverse()
      .find(({ n }) => {
        if (n.kind !== 'assistant' || !n.streaming) return false
        // Match the open streaming bubble even when step is only set on later chunks.
        return step == null || n.step == null || n.step === step
      })?.i
    if (idx != null) {
      const next = [...nodes]
      const cur = next[idx]
      if (cur.kind === 'assistant') {
        next[idx] = {
          ...cur,
          text: (cur.text || '') + ev.content,
          step: cur.step ?? step,
          turnId: turnId || cur.turnId,
        }
      }
      return next
    }
    return [
      ...nodes,
      {
        kind: 'assistant',
        id: idBase,
        text: ev.content,
        streaming: true,
        step,
        turnId,
      },
    ]
  }

  if (ev.event === 'user_message' && ev.content) {
    return [...nodes, { kind: 'user', id: idBase, text: ev.content, turnId }]
  }

  if (ev.event === 'assistant_message' && ev.content) {
    const step = ev.step
    // Only finalize an in-progress streaming bubble; never overwrite a prior completed assistant.
    const idx = [...nodes]
      .map((n, i) => ({ n, i }))
      .reverse()
      .find(
        ({ n }) =>
          n.kind === 'assistant' &&
          n.streaming &&
          (step == null || n.step == null || n.step === step),
      )?.i
    if (idx != null) {
      const next = [...nodes]
      const cur = next[idx]
      if (cur.kind === 'assistant') {
        next[idx] = {
          ...cur,
          text: ev.content,
          streaming: false,
          step: step ?? cur.step,
          turnId: turnId || cur.turnId,
        }
      }
      return next
    }
    return [
      ...nodes,
      { kind: 'assistant', id: idBase, text: ev.content, streaming: false, step, turnId },
    ]
  }

  if (ev.event === 'tool_call') {
    const tool = String(ev.tool || '')
    const args = ev.arguments || {}
    return [
      ...nodes,
      {
        kind: 'tool',
        id: idBase,
        tool,
        title: displayToolName(tool),
        summary: summarizeToolArgs(tool, args),
        arguments: args,
        state: 'running',
        turnId,
        toolCallId: ev.tool_call_id,
      },
    ]
  }

  if (ev.event === 'tool_result') {
    const callId = ev.tool_call_id
    const tool = String(ev.tool || '')
    const toolUseful = Boolean(tool && tool !== 'tool')
    const ok = Boolean(ev.ok ?? ev.result?.ok !== false)
    const resultText = formatToolResult(ev.result ?? ev)
    let idx =
      callId
        ? [...nodes]
            .map((n, i) => ({ n, i }))
            .reverse()
            .find(({ n }) => n.kind === 'tool' && n.toolCallId === callId)?.i
        : undefined
    if (idx == null) {
      idx = [...nodes]
        .map((n, i) => ({ n, i }))
        .reverse()
        .find(({ n }) => {
          if (n.kind !== 'tool' || n.state !== 'running') return false
          if (!toolUseful) return true
          return n.tool === tool
        })?.i
    }

    if (idx != null) {
      const next = [...nodes]
      const cur = next[idx]
      if (cur.kind === 'tool') {
        next[idx] = {
          ...cur,
          tool: toolUseful ? tool : cur.tool,
          title: displayToolName(toolUseful ? tool : cur.tool),
          summary: cur.summary || (ok ? '完成' : '失败'),
          resultText,
          state: ok ? 'ok' : 'error',
          turnId: turnId || cur.turnId,
          toolCallId: callId || cur.toolCallId,
        }
      }
      return next
    }
    return [
      ...nodes,
      {
        kind: 'tool',
        id: idBase,
        tool: toolUseful ? tool : 'tool',
        title: displayToolName(toolUseful ? tool : 'tool'),
        summary: ok ? '完成' : '失败',
        arguments: {},
        resultText,
        state: ok ? 'ok' : 'error',
        turnId,
        toolCallId: callId,
      },
    ]
  }

  if (ev.event === 'job_progress') {
    return [
      ...nodes,
      {
        kind: 'progress',
        id: idBase,
        title: ev.tool || '任务',
        message: ev.message || '进行中…',
        turnId,
      },
    ]
  }

  if (ev.event === 'needs_confirm') {
    return [
      ...nodes,
      {
        kind: 'confirm',
        id: idBase,
        message: ev.message || `即将执行 ${ev.tool}`,
        confirmId: ev.confirm_id || '',
        tool: ev.tool,
        turnId,
      },
    ]
  }

  if (ev.event === 'error') {
    return [...nodes, { kind: 'error', id: idBase, message: ev.message || '错误', turnId }]
  }

  if (ev.event === 'turn_end') {
    return nodes
      .map((n) => {
        if (n.kind === 'assistant' && n.streaming) return { ...n, streaming: false }
        if (n.kind === 'tool' && n.state === 'running') {
          return { ...n, state: 'ok' as const, summary: n.summary || '完成' }
        }
        return n
      })
      .concat([{ kind: 'turn_end', id: idBase, status: ev.status || 'done', turnId }])
  }

  return nodes
}

/** Rebuild transcript nodes from durable session events (pairs tool call/result). */
export function nodesFromEvents(
  events: Array<{
    type: string
    payload?: Record<string, unknown>
    seq: number
    turn_id?: string
  }>,
): AgentChatNode[] {
  const nodes: AgentChatNode[] = []
  const byCall = new Map<string, number>()
  const pendingRunning: number[] = []

  for (const ev of events) {
    const node = eventToNode(ev.type, ev.payload || {}, ev.seq, ev.turn_id)
    if (!node) continue

    if (node.kind === 'tool' && node.state === 'running') {
      if (node.toolCallId) byCall.set(node.toolCallId, nodes.length)
      pendingRunning.push(nodes.length)
      nodes.push(node)
      continue
    }

    if (node.kind === 'tool' && node.state !== 'running') {
      let prev: number | undefined
      if (node.toolCallId) prev = byCall.get(node.toolCallId)
      if (prev == null && pendingRunning.length) prev = pendingRunning.shift()
      else if (prev != null) {
        const at = pendingRunning.indexOf(prev)
        if (at >= 0) pendingRunning.splice(at, 1)
      }

      if (prev != null && nodes[prev]?.kind === 'tool') {
        const cur = nodes[prev]
        if (cur.kind === 'tool') {
          const toolUseful = Boolean(node.tool && node.tool !== 'tool')
          nodes[prev] = {
            ...cur,
            tool: toolUseful ? node.tool : cur.tool,
            title: displayToolName(toolUseful ? node.tool : cur.tool),
            resultText: node.resultText,
            state: node.state,
            summary: cur.summary || node.summary,
            toolCallId: node.toolCallId || cur.toolCallId,
          }
          continue
        }
      }
    }

    nodes.push(node)
  }

  // Any tool still "running" after the log ends is treated as finished.
  return nodes.map((n) =>
    n.kind === 'tool' && n.state === 'running'
      ? { ...n, state: 'ok' as const, summary: n.summary || '完成' }
      : n,
  )
}

export function groupNodesByTurn(nodes: AgentChatNode[]): { key: string; nodes: AgentChatNode[]; settled: boolean }[] {
  const groups: { key: string; nodes: AgentChatNode[]; settled: boolean }[] = []
  let orphan: AgentChatNode[] = []

  const flushOrphan = () => {
    if (!orphan.length) return
    groups.push({
      key: `orphan-${groups.length}`,
      nodes: orphan,
      settled: orphan.some((n) => n.kind === 'turn_end'),
    })
    orphan = []
  }

  for (const n of nodes) {
    const tid = n.turnId
    if (!tid) {
      flushOrphan()
      orphan.push(n)
      continue
    }
    flushOrphan()
    const last = groups[groups.length - 1]
    if (last && last.key === tid) {
      last.nodes.push(n)
      if (n.kind === 'turn_end') last.settled = true
    } else {
      groups.push({ key: tid, nodes: [n], settled: n.kind === 'turn_end' })
    }
  }
  flushOrphan()
  return groups
}
