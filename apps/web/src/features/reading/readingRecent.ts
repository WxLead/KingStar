/** Recently opened papers for the bookshelf home. */

const STORAGE_KEY = 'start:reading-recent'
const MAX_RECENT = 12

export type RecentRead = {
  uploadId: string
  openedAt: number
}

function loadRaw(): RecentRead[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (x): x is RecentRead =>
          !!x &&
          typeof x === 'object' &&
          typeof (x as RecentRead).uploadId === 'string' &&
          typeof (x as RecentRead).openedAt === 'number',
      )
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

function saveRaw(items: RecentRead[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_RECENT)))
  } catch {
    /* ignore */
  }
}

export function touchRecentRead(uploadId: string) {
  const id = uploadId.trim()
  if (!id) return
  const next = [{ uploadId: id, openedAt: Date.now() }, ...loadRaw().filter((x) => x.uploadId !== id)]
  saveRaw(next)
}

export function listRecentReads(): RecentRead[] {
  return loadRaw()
}

export function removeRecentRead(uploadId: string) {
  const id = uploadId.trim()
  if (!id) return
  saveRaw(loadRaw().filter((x) => x.uploadId !== id))
}

export function formatOpenedAt(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return `今天 ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return '昨天'
  }
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}
