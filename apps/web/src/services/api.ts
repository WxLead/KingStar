import type { TaskStatus } from '@/types'

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1'

/** User-facing pipeline stage for sidebar / workspace. */
export type PipelineStage =
  | 'unprocessed'
  | 'parsing'
  | 'translating'
  | 'parsed'
  | 'completed'
  | 'failed'

export type UploadItem = {
  upload_id: string
  filename: string
  size: number
  content_type: string | null
  created_at: string
  last_task_id: string | null
  last_status: TaskStatus | null
  /** True when document_zh.md exists for last_task_id. */
  has_zh?: boolean
  pipeline_stage?: PipelineStage
  /** Library fields from SQLite */
  has_notes?: boolean
  favorited?: boolean
  favorited_at?: string | null
  title?: string | null
  authors?: string[]
  year?: number | null
  doi?: string | null
  abstract?: string | null
  venue?: string | null
  venue_type?: string | null
  metadata_source?: string | null
  arxiv_id?: string | null
  folder?: string | null
  tags?: string[]
}

export type NoteDocRemote = {
  upload_id: string
  html: string
  json?: unknown
  updated_at: number
}

export type PaperLibrary = {
  upload_id: string
  title?: string | null
  authors?: string[]
  year?: number | null
  doi?: string | null
  abstract?: string | null
  venue?: string | null
  venue_type?: string | null
  metadata_source?: string | null
  metadata_identified_at?: string | null
  arxiv_id?: string | null
  favorited?: boolean
  favorited_at?: string | null
  folder?: string | null
  tags?: string[]
  has_notes?: boolean
  updated_at?: string | null
}

export type TaskSummary = {
  task_id: string
  filename: string
  status: TaskStatus
  created_at: string
  updated_at: string
  error: string | null
  upload_id?: string
  translate?: boolean
}

export type TaskDetail = TaskSummary & {
  result: {
    markdown_url?: string
    middle_json_url?: string
    content_list_url?: string
    zh_markdown_url?: string
    pdf_url?: string
    meta?: Record<string, unknown>
  } | null
  progress?: {
    ratio?: number
    message?: string
    done?: number
    total?: number
  } | null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `${res.status} ${res.statusText}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function uploadFile(file: File): Promise<UploadItem> {
  const body = new FormData()
  body.append('file', file)
  return request('/uploads', { method: 'POST', body })
}

/** Download PDF from arXiv / DOI / direct URL and register as upload. */
export async function uploadFromUrl(url: string): Promise<UploadItem> {
  const res = await fetch(`${API_BASE}/uploads/from-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.trim() }),
  })
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
      else if (Array.isArray(body.detail)) {
        detail = body.detail
          .map((x) => (typeof x === 'object' && x && 'msg' in x ? String((x as { msg: unknown }).msg) : String(x)))
          .join('; ')
      }
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new Error(detail || `${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<UploadItem>
}

export async function listUploads(): Promise<{ items: UploadItem[] }> {
  return request('/uploads')
}

export async function deleteUpload(uploadId: string): Promise<{ ok: boolean }> {
  return request(`/uploads/${uploadId}`, { method: 'DELETE' })
}

/** Fetch original upload bytes for preview (PDF / image / text). */
export async function fetchUploadFile(uploadId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/uploads/${uploadId}/file`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `${res.status} ${res.statusText}`)
  }
  return res.blob()
}

export function uploadFileUrl(uploadId: string): string {
  return `${API_BASE}/uploads/${uploadId}/file`
}

export async function createTask(opts: {
  upload_id: string
  translate?: boolean
  beautify?: boolean
  parse_backend?: string
  server_url?: string | null
}): Promise<{ task_id: string; status: TaskStatus }> {
  return request('/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      translate: false,
      beautify: false,
      parse_backend: 'hybrid-engine',
      ...opts,
    }),
  })
}

/** Translate existing parsed task (uses document.md; does not re-run MinerU). */
export async function translateTask(
  taskId: string,
  opts?: { beautify?: boolean },
): Promise<{ task_id: string; status: TaskStatus }> {
  return request(`/tasks/${taskId}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ beautify: opts?.beautify ?? false }),
  })
}

/** Export Markdown → PDF via BFF `export_pdf` (same as CLI direct PDF step). */
export async function exportTaskPdf(
  taskId: string,
  source: 'en' | 'zh',
  downloadName: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/export/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let detail = text || `${res.status} ${res.statusText}`
    try {
      const parsed = JSON.parse(text) as { detail?: string }
      if (parsed.detail) detail = parsed.detail
    } catch {
      /* keep raw */
    }
    throw new Error(detail)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = downloadName.endsWith('.pdf') ? downloadName : `${downloadName}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

export async function listTasks(): Promise<{ items: TaskSummary[] }> {
  return request('/tasks')
}

export async function getTask(taskId: string): Promise<TaskDetail> {
  return request(`/tasks/${taskId}`)
}

export async function fetchArtifactText(taskId: string, name: string): Promise<string> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/artifacts/${name}`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `${res.status} ${res.statusText}`)
  }
  return res.text()
}

export async function fetchArtifactJson<T = unknown>(taskId: string, name: string): Promise<T> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/artifacts/${name}`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export async function pollTask(
  taskId: string,
  opts?: {
    intervalMs?: number
    timeoutMs?: number
    onUpdate?: (task: TaskDetail) => void
  },
): Promise<TaskDetail> {
  const interval = opts?.intervalMs ?? 1500
  const timeout = opts?.timeoutMs ?? 30 * 60 * 1000
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const task = await getTask(taskId)
    opts?.onUpdate?.(task)
    if (task.status === 'done' || task.status === 'failed') return task
    await new Promise((r) => setTimeout(r, interval))
  }
  throw new Error('任务超时')
}

/** Load markdown + middle.json (+ content_list / content_list_zh) for a finished task. */
export async function loadParseArtifacts(taskId: string): Promise<{
  markdown: string
  middle: unknown | null
  contentList: unknown | null
  contentListZh: unknown | null
  zhMarkdown: string | null
}> {
  const [markdown, middle, contentList, contentListZh, zhMarkdown] = await Promise.all([
    fetchArtifactText(taskId, 'markdown'),
    fetchArtifactJson(taskId, 'middle_json').catch(() => null),
    fetchArtifactJson(taskId, 'content_list').catch(() => null),
    fetchArtifactJson(taskId, 'content_list_zh').catch(() => null),
    fetchArtifactText(taskId, 'zh_markdown').catch(() => null),
  ])
  return { markdown, middle, contentList, contentListZh, zhMarkdown }
}

/** Persist Plan A layout edits; rebuilds document.md server-side. */
export async function saveTaskLayout(
  taskId: string,
  middle: unknown,
  contentList: unknown[],
): Promise<{ ok: boolean; task_id: string; zh_stale?: boolean }> {
  return request(`/tasks/${taskId}/layout`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ middle, content_list: contentList }),
  })
}

/** Upload a cropped figure into the task's images/ folder (for image_body edits). */
export async function uploadTaskImage(
  taskId: string,
  blob: Blob,
  filename = 'crop.png',
): Promise<{ filename: string; img_path: string; url: string }> {
  const form = new FormData()
  form.append('file', blob, filename)
  const res = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/images`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `上传图片失败 (${res.status})`)
  }
  return res.json() as Promise<{ filename: string; img_path: string; url: string }>
}

/** Ensure content_list_zh.json exists (backfill via /link-zh if needed). */
export async function ensureLinkZh(taskId: string): Promise<void> {
  try {
    await fetchArtifactJson(taskId, 'content_list_zh')
    return
  } catch {
    /* need backfill */
  }
  const started = await request<{ task_id: string; status: TaskStatus }>(
    `/tasks/${taskId}/link-zh`,
    { method: 'POST' },
  )
  if (started.status === 'done') return
  const done = await pollTask(taskId, { intervalMs: 1500 })
  if (done.status === 'failed') {
    throw new Error(done.error || '译文联动段落生成失败')
  }
}

export type HealthStatus = {
  ok: boolean
  mineru: string
  translate: string
  llm?: string
  data_dir?: string
}

export function health(): Promise<HealthStatus> {
  return request('/health')
}

/** Re-run a failed/interrupted task with the same options. */
export async function retryTask(taskId: string): Promise<{ task_id: string; status: TaskStatus }> {
  return request(`/tasks/${taskId}/retry`, { method: 'POST' })
}

export type LlmSettingsPublic = {
  api_key_set: boolean
  api_key_masked: string
  base_url: string
  model: string
  source: 'settings' | 'env' | 'default'
}

export type LlmSettingsUpdate = {
  api_key?: string | null
  base_url?: string | null
  model?: string | null
  clear_api_key?: boolean
}

export type LlmModelsResult = {
  ok: boolean
  models: string[]
  detail: string
  base_url: string
}

export function getLlmSettings(): Promise<LlmSettingsPublic> {
  return request('/settings/llm')
}

export function saveLlmSettings(body: LlmSettingsUpdate): Promise<LlmSettingsPublic> {
  return request('/settings/llm', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function listLlmModels(body: {
  api_key?: string | null
  base_url?: string | null
}): Promise<LlmModelsResult> {
  return request('/settings/llm/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export type ReadingChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ReadingChatUsage = {
  used: number
  budget: number
  pct: number
  compacted?: boolean
  paper_digest?: string
  model_limit?: number
}

export type ReadingChatStreamHandlers = {
  onDelta?: (text: string) => void
  onUsage?: (usage: ReadingChatUsage) => void
  onCompacted?: (detail: string) => void
  onDone?: (info: { model: string } & Partial<ReadingChatUsage>) => void
  signal?: AbortSignal
}

/** Reading-room Q&A via BFF → DeepSeek (SSE stream). */
export async function readingChatStream(
  opts: {
    message: string
    filename?: string
    markdown?: string
    zhMarkdown?: string | null
    paperDigest?: string
    history?: ReadingChatMessage[]
  },
  handlers: ReadingChatStreamHandlers = {},
): Promise<void> {
  const res = await fetch(`${API_BASE}/reading/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      message: opts.message,
      filename: opts.filename || '',
      markdown: opts.markdown || '',
      zh_markdown: opts.zhMarkdown || '',
      paper_digest: opts.paperDigest || '',
      history: opts.history || [],
    }),
    signal: handlers.signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `${res.status} ${res.statusText}`)
  }
  if (!res.body) {
    throw new Error('浏览器不支持流式响应')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  const handleEvent = (raw: string) => {
    const dataLine = raw
      .split('\n')
      .map((l) => l.trimEnd())
      .find((l) => l.startsWith('data:'))
    if (!dataLine) return
    const jsonText = dataLine.replace(/^data:\s*/, '')
    if (!jsonText || jsonText === '[DONE]') return
    let payload: {
      type?: string
      text?: string
      model?: string
      detail?: string
      used?: number
      budget?: number
      pct?: number
      compacted?: boolean
      paper_digest?: string
      model_limit?: number
    }
    try {
      payload = JSON.parse(jsonText) as typeof payload
    } catch {
      return
    }
    if (payload.type === 'delta' && payload.text) {
      handlers.onDelta?.(payload.text)
    } else if (payload.type === 'usage') {
      handlers.onUsage?.({
        used: Number(payload.used) || 0,
        budget: Number(payload.budget) || 0,
        pct: Number(payload.pct) || 0,
        compacted: Boolean(payload.compacted),
        paper_digest: payload.paper_digest,
        model_limit: payload.model_limit,
      })
    } else if (payload.type === 'compacted') {
      handlers.onCompacted?.(payload.detail || '已压缩较早对话')
    } else if (payload.type === 'done') {
      handlers.onDone?.({
        model: payload.model || '',
        used: payload.used,
        budget: payload.budget,
        pct: payload.pct,
        paper_digest: payload.paper_digest,
      })
    } else if (payload.type === 'error') {
      throw new Error(payload.detail || 'DeepSeek 调用失败')
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const part of parts) {
      if (part.trim()) handleEvent(part)
    }
  }
  if (buffer.trim()) handleEvent(buffer)
}

/** @deprecated Prefer readingChatStream — kept for non-UI callers. */
export async function readingChat(opts: {
  message: string
  filename?: string
  markdown?: string
  zhMarkdown?: string | null
  paperDigest?: string
  history?: ReadingChatMessage[]
}): Promise<{ reply: string; model: string }> {
  let reply = ''
  let model = ''
  await readingChatStream(opts, {
    onDelta: (t) => {
      reply += t
    },
    onDone: (info) => {
      model = info.model
    },
  })
  return { reply, model }
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

/** Format upload created_at for list secondary lines. */
export function formatUploadTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Display title: library metadata title, else filename stem. */
export function paperDisplayTitle(item: Pick<UploadItem, 'filename' | 'title'>): string {
  const t = (item.title || '').trim()
  if (t) return t
  const base = item.filename.replace(/\.[^.]+$/, '').trim()
  return base || item.filename || '未命名文献'
}

export async function getNotes(uploadId: string): Promise<NoteDocRemote> {
  return request(`/uploads/${uploadId}/notes`)
}

export async function putNotes(
  uploadId: string,
  body: { html: string; json?: unknown; updated_at?: number },
): Promise<NoteDocRemote> {
  return request(`/uploads/${uploadId}/notes`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export type AnnotationsRemote = {
  upload_id: string
  items: unknown[]
  updated_at: number
}

export async function getAnnotations(uploadId: string): Promise<AnnotationsRemote> {
  return request(`/uploads/${uploadId}/annotations`)
}

export async function putAnnotations(
  uploadId: string,
  body: { items: unknown[]; updated_at?: number },
): Promise<AnnotationsRemote> {
  return request(`/uploads/${uploadId}/annotations`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function getPaperLibrary(uploadId: string): Promise<PaperLibrary> {
  return request(`/uploads/${uploadId}/library`)
}

export async function patchPaperLibrary(
  uploadId: string,
  patch: Partial<{
    title: string | null
    authors: string[]
    year: number | null
    doi: string | null
    abstract: string | null
    venue: string | null
    venue_type: string | null
    arxiv_id: string | null
    folder: string | null
    favorited: boolean
    tags: string[]
  }>,
): Promise<PaperLibrary> {
  return request(`/uploads/${uploadId}/library`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

export async function identifyPaper(
  uploadId: string,
  opts?: { force?: boolean },
): Promise<{
  ok: boolean
  skipped?: boolean
  matched_by?: string | null
  detail?: string
  paper?: PaperLibrary
}> {
  return request(`/uploads/${uploadId}/identify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: opts?.force ?? false }),
  })
}

export async function setPaperFavorite(
  uploadId: string,
  favorited: boolean,
): Promise<PaperLibrary> {
  return request(`/uploads/${uploadId}/favorite`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ favorited }),
  })
}

export async function setPaperTags(uploadId: string, tags: string[]): Promise<PaperLibrary> {
  return request(`/uploads/${uploadId}/tags`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  })
}

export async function listLibraryTags(): Promise<{ items: string[] }> {
  return request('/library/tags')
}

export async function searchLibrary(q: string): Promise<{ query: string; upload_ids: string[] }> {
  const params = new URLSearchParams({ q })
  return request(`/library/search?${params}`)
}

export async function reindexLibrary(): Promise<{ ok: boolean; indexed: number }> {
  return request('/library/reindex', { method: 'POST' })
}

/** Fetch citation text for one paper (server-side, latest DB metadata). */
export async function fetchCitationText(
  uploadId: string,
  format: 'bibtex' | 'ris' = 'bibtex',
): Promise<string> {
  const res = await fetch(
    `${API_BASE}/uploads/${uploadId}/citation?format=${encodeURIComponent(format)}`,
  )
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(detail || `citation failed (${res.status})`)
  }
  return res.text()
}

/** Batch citation export from server. Empty uploadIds = all uploads. */
export async function exportLibraryCitations(opts: {
  format: 'bibtex' | 'ris'
  uploadIds?: string[]
}): Promise<string> {
  const res = await fetch(`${API_BASE}/library/citations/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: opts.format,
      upload_ids: opts.uploadIds ?? null,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(detail || `export failed (${res.status})`)
  }
  return res.text()
}

// --- Research assistant (session log + turns) -------------------------------

export type AgentStreamEvent = {
  event: string
  session_id?: string
  turn_id?: string
  seq?: number
  event_id?: string
  step?: number
  content?: string
  tool?: string
  arguments?: Record<string, unknown>
  result?: { ok?: boolean; error?: string; data?: unknown }
  ok?: boolean
  message?: string
  status?: string
  tool_call_id?: string
  confirm_id?: string
  approved?: boolean
  goal?: string
  model?: string
}

async function agentRequestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export async function createAgentSession(title = ''): Promise<{ session_id: string; title?: string }> {
  return agentRequestJson('/agent/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

export type AgentSessionSummary = {
  session_id: string
  title?: string
  status?: string
  created_at?: string
  updated_at?: string
}

export async function listAgentSessions(limit = 30): Promise<{ items: AgentSessionSummary[] }> {
  return agentRequestJson(`/agent/sessions?limit=${limit}`)
}

export async function listAgentSessionEvents(
  sessionId: string,
  afterSeq = 0,
): Promise<{
  items: Array<{ seq: number; type: string; payload: Record<string, unknown>; turn_id?: string }>
}> {
  return agentRequestJson(
    `/agent/sessions/${encodeURIComponent(sessionId)}/events?after_seq=${afterSeq}&limit=5000`,
  )
}

export async function archiveAgentSession(sessionId: string): Promise<void> {
  await agentRequestJson(`/agent/sessions/${encodeURIComponent(sessionId)}/archive`, {
    method: 'POST',
  })
}

export async function deleteAgentSession(sessionId: string): Promise<void> {
  await agentRequestJson(`/agent/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
}

export async function confirmAgentTurn(
  sessionId: string,
  turnId: string,
  confirmId: string,
  approved: boolean,
): Promise<void> {
  await agentRequestJson(
    `/agent/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}/confirm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm_id: confirmId, approved }),
    },
  )
}

export async function cancelAgentTurn(sessionId: string, turnId: string): Promise<void> {
  await agentRequestJson(
    `/agent/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}/cancel`,
    { method: 'POST' },
  )
}

/** Hard-interrupt whatever turn is running for this session (no turnId required). */
export async function interruptAgentSession(sessionId: string): Promise<{
  ok: boolean
  turn_id?: string | null
  interrupted?: boolean
}> {
  return agentRequestJson(`/agent/sessions/${encodeURIComponent(sessionId)}/interrupt`, {
    method: 'POST',
  })
}

export async function runAgentTurnStream(
  sessionId: string,
  goal: string,
  handlers: { onEvent?: (ev: AgentStreamEvent) => void; signal?: AbortSignal } = {},
): Promise<string | null> {
  const res = await fetch(`${API_BASE}/agent/sessions/${encodeURIComponent(sessionId)}/turns`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ goal }),
    signal: handlers.signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `${res.status} ${res.statusText}`)
  }
  if (!res.body) throw new Error('浏览器不支持流式响应')

  let turnId = res.headers.get('X-StarT-Agent-Turn-Id')
  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  const handleEvent = (raw: string) => {
    const dataLine = raw
      .split('\n')
      .map((l) => l.trimEnd())
      .find((l) => l.startsWith('data:'))
    if (!dataLine) return
    const jsonText = dataLine.replace(/^data:\s*/, '')
    if (!jsonText || jsonText === '[DONE]') return
    let payload: AgentStreamEvent
    try {
      payload = JSON.parse(jsonText) as AgentStreamEvent
    } catch {
      return
    }
    if (payload.turn_id) turnId = payload.turn_id
    handlers.onEvent?.(payload)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const part of parts) {
      if (part.trim()) handleEvent(part)
    }
  }
  if (buffer.trim()) handleEvent(buffer)
  return turnId
}
