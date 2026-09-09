import type { AgentArtifact, AgentStreamEvent } from '@/services/api'

function fromUpsert(ev: AgentStreamEvent): AgentArtifact | null {
  const id = ev.artifact_id
  if (!id || !ev.session_id) return null
  const kind = (ev.kind || 'report') as AgentArtifact['kind']
  return {
    artifact_id: id,
    session_id: ev.session_id,
    turn_id: ev.turn_id,
    kind,
    title: ev.title || (kind === 'web' ? '网页' : '报告'),
    status: ev.status || 'drafting',
    uri: ev.uri,
    rel_path: ev.rel_path,
    content: typeof ev.content === 'string' ? ev.content : '',
    meta: ev.meta,
    version: ev.version,
    created_at: ev.created_at,
    updated_at: ev.updated_at,
  }
}

/** Merge live SSE artifact events into the pane state. */
export function applyArtifactEvent(
  prev: AgentArtifact[],
  ev: AgentStreamEvent,
): AgentArtifact[] {
  if (ev.event === 'artifact_upsert') {
    const art = fromUpsert(ev)
    if (!art) return prev
    const idx = prev.findIndex((a) => a.artifact_id === art.artifact_id)
    if (idx < 0) return [art, ...prev]
    const next = [...prev]
    next[idx] = {
      ...next[idx],
      ...art,
      content: art.content ?? next[idx].content,
    }
    return next
  }
  if (ev.event === 'artifact_delta') {
    const id = ev.artifact_id
    if (!id) return prev
    const idx = prev.findIndex((a) => a.artifact_id === id)
    const chunk = ev.chunk || ''
    if (idx < 0) {
      if (!ev.session_id) return prev
      return [
        {
          artifact_id: id,
          session_id: ev.session_id,
          turn_id: ev.turn_id,
          kind: 'report',
          title: ev.title || '报告',
          status: ev.status || 'drafting',
          content: chunk,
          version: ev.version,
        },
        ...prev,
      ]
    }
    const cur = prev[idx]
    const next = [...prev]
    next[idx] = {
      ...cur,
      content: (cur.content || '') + chunk,
      status: ev.status || cur.status,
      title: ev.title || cur.title,
      version: ev.version ?? cur.version,
      turn_id: ev.turn_id || cur.turn_id,
    }
    // Bump active report to front
    if (idx > 0) {
      const [item] = next.splice(idx, 1)
      next.unshift(item)
    }
    return next
  }
  return prev
}

export function preferActiveId(artifacts: AgentArtifact[], current?: string | null): string | null {
  if (current && artifacts.some((a) => a.artifact_id === current)) return current
  const live = artifacts.filter((a) => a.status !== 'archived')
  const drafting = live.find((a) => a.status === 'drafting')
  if (drafting) return drafting.artifact_id
  return live[0]?.artifact_id ?? artifacts[0]?.artifact_id ?? null
}
