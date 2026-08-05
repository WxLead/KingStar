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
  opts?: { intervalMs?: number; timeoutMs?: number },
): Promise<TaskDetail> {
  const interval = opts?.intervalMs ?? 1500
  const timeout = opts?.timeoutMs ?? 30 * 60 * 1000
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const task = await getTask(taskId)
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

export function health(): Promise<{ ok: boolean; mineru: string; translate: string }> {
  return request('/health')
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
