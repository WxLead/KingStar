/** Persist only the active session id (events live on the server). */

const STORAGE_KEY = 'start.agent.sessionId.v2'

export function loadSessionId(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveSessionId(sessionId: string | null) {
  try {
    if (!sessionId) sessionStorage.removeItem(STORAGE_KEY)
    else sessionStorage.setItem(STORAGE_KEY, sessionId)
  } catch {
    /* ignore */
  }
}
