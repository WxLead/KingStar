/** Sidebar “最近解析” dismiss list — hides records without deleting uploads. */

const STORAGE_KEY = 'start:sidebar-hidden-parses'

function loadHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0))
  } catch {
    return new Set()
  }
}

function saveHidden(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    /* ignore */
  }
}

export function listHiddenParseIds(): Set<string> {
  return loadHidden()
}

export function hideParseRecord(uploadId: string) {
  const id = uploadId.trim()
  if (!id) return
  const next = loadHidden()
  next.add(id)
  saveHidden(next)
}
