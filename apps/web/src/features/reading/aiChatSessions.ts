/** Multi-session AI chat storage for reading room (per paper). */

import type { AiQuotePayload } from '@/features/reading/aiQuoteBridge'
import type { ReadingChatUsage } from '@/services/api'

export type StoredChatMsg = {
  id: string
  role: 'user' | 'assistant'
  text: string
  collapsed?: boolean
  quote?: AiQuotePayload
}

export type AiChatSession = {
  id: string
  title: string
  msgs: StoredChatMsg[]
  paperDigest: string
  paperBootstrapped: boolean
  usage: ReadingChatUsage | null
  createdAt: number
  updatedAt: number
}

export type AiChatStore = {
  version: 2
  filename: string
  activeId: string
  sessions: AiChatSession[]
  historyOpen: boolean
}

const STORE_KEY = (uploadId: string) => `start:reading-ai-chat:${uploadId}`
const HISTORY_UI_KEY = 'start:reading-ai-history-open'

export function defaultWelcomeText(filename: string): string {
  return `你好，我是这篇文献的解读助手。你可以问我关于「${filename}」的问题、术语解释或段落总结。`
}

export function defaultWelcomeMsg(filename: string): StoredChatMsg {
  return {
    id: 'welcome',
    role: 'assistant',
    text: defaultWelcomeText(filename),
  }
}

function normalizeQuote(raw: unknown): AiQuotePayload | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const q = raw as { text?: unknown; source?: unknown }
  if (typeof q.text !== 'string' || !q.text.trim()) return undefined
  if (q.source !== 'md' && q.source !== 'zh') return undefined
  return { text: q.text, source: q.source }
}

function normalizeMsgs(raw: unknown, filename: string): StoredChatMsg[] {
  if (!Array.isArray(raw)) return [defaultWelcomeMsg(filename)]
  const msgs = raw
    .filter(
      (m): m is Record<string, unknown> =>
        !!m &&
        typeof m === 'object' &&
        ((m as { role?: string }).role === 'user' ||
          (m as { role?: string }).role === 'assistant') &&
        typeof (m as { text?: unknown }).text === 'string' &&
        typeof (m as { id?: unknown }).id === 'string',
    )
    .map((m) => ({
      id: String(m.id),
      role: m.role as 'user' | 'assistant',
      text: String(m.text),
      collapsed: Boolean(m.collapsed),
      quote: normalizeQuote(m.quote),
    }))
  return msgs.length ? msgs : [defaultWelcomeMsg(filename)]
}

function normalizeUsage(raw: unknown): ReadingChatUsage | null {
  if (!raw || typeof raw !== 'object') return null
  const u = raw as ReadingChatUsage
  if (typeof u.budget !== 'number' || typeof u.used !== 'number') return null
  return u
}

export function sessionHasUserContent(session: AiChatSession): boolean {
  return session.msgs.some((m) => m.role === 'user' && m.id !== 'welcome')
}

export function deriveSessionTitle(msgs: StoredChatMsg[]): string {
  const first = msgs.find((m) => m.role === 'user' && m.text.trim())
  if (!first) return '新对话'
  const t = first.text.replace(/\s+/g, ' ').trim()
  return t.length > 28 ? `${t.slice(0, 28)}…` : t
}

export function createEmptySession(filename: string): AiChatSession {
  const now = Date.now()
  return {
    id: `s-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: '新对话',
    msgs: [defaultWelcomeMsg(filename)],
    paperDigest: '',
    paperBootstrapped: false,
    usage: null,
    createdAt: now,
    updatedAt: now,
  }
}

function migrateLegacy(parsed: Record<string, unknown>, filename: string): AiChatStore {
  const session: AiChatSession = {
    id: `s-legacy-${Date.now()}`,
    title: '对话',
    msgs: normalizeMsgs(parsed.msgs, filename),
    paperDigest: typeof parsed.paperDigest === 'string' ? parsed.paperDigest : '',
    paperBootstrapped: Boolean(parsed.paperBootstrapped),
    usage: normalizeUsage(parsed.usage),
    createdAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
  }
  session.title = deriveSessionTitle(session.msgs)
  return {
    version: 2,
    filename: typeof parsed.filename === 'string' ? parsed.filename : filename,
    activeId: session.id,
    sessions: [session],
    historyOpen: loadHistoryOpenPref(),
  }
}

function loadHistoryOpenPref(): boolean {
  try {
    return localStorage.getItem(HISTORY_UI_KEY) === '1'
  } catch {
    return false
  }
}

export function saveHistoryOpenPref(open: boolean) {
  try {
    localStorage.setItem(HISTORY_UI_KEY, open ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function loadAiChatStore(uploadId: string, filename: string): AiChatStore {
  try {
    const raw = localStorage.getItem(STORE_KEY(uploadId))
    if (!raw) {
      const s = createEmptySession(filename)
      return {
        version: 2,
        filename,
        activeId: s.id,
        sessions: [s],
        historyOpen: loadHistoryOpenPref(),
      }
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.version === 2 && Array.isArray(parsed.sessions)) {
      const sessions = (parsed.sessions as unknown[])
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const s = item as Record<string, unknown>
          if (typeof s.id !== 'string') return null
          const msgs = normalizeMsgs(s.msgs, filename)
          return {
            id: s.id,
            title:
              typeof s.title === 'string' && s.title.trim()
                ? s.title
                : deriveSessionTitle(msgs),
            msgs,
            paperDigest: typeof s.paperDigest === 'string' ? s.paperDigest : '',
            paperBootstrapped: Boolean(s.paperBootstrapped),
            usage: normalizeUsage(s.usage),
            createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
            updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : Date.now(),
          } satisfies AiChatSession
        })
        .filter(Boolean) as AiChatSession[]

      if (!sessions.length) {
        const s = createEmptySession(filename)
        return {
          version: 2,
          filename,
          activeId: s.id,
          sessions: [s],
          historyOpen: loadHistoryOpenPref(),
        }
      }

      const activeId =
        typeof parsed.activeId === 'string' && sessions.some((s) => s.id === parsed.activeId)
          ? parsed.activeId
          : sessions[0].id

      return {
        version: 2,
        filename: typeof parsed.filename === 'string' ? parsed.filename : filename,
        activeId,
        sessions: sessions.sort((a, b) => b.updatedAt - a.updatedAt),
        historyOpen:
          typeof parsed.historyOpen === 'boolean' ? parsed.historyOpen : loadHistoryOpenPref(),
      }
    }

    // Legacy single-chat blob
    return migrateLegacy(parsed, filename)
  } catch {
    const s = createEmptySession(filename)
    return {
      version: 2,
      filename,
      activeId: s.id,
      sessions: [s],
      historyOpen: loadHistoryOpenPref(),
    }
  }
}

export function saveAiChatStore(uploadId: string, store: AiChatStore) {
  try {
    localStorage.setItem(STORE_KEY(uploadId), JSON.stringify(store))
    saveHistoryOpenPref(store.historyOpen)
  } catch {
    /* quota / private mode */
  }
}

export function getActiveSession(store: AiChatStore): AiChatSession {
  return store.sessions.find((s) => s.id === store.activeId) || store.sessions[0]
}

export function formatSessionTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}
