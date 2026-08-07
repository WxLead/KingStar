import { useSyncExternalStore } from 'react'

export type ShortcutId = 'toggleSidebar' | 'quoteToAi'

export type ShortcutBinding = {
  /** KeyboardEvent.key, letters stored lowercase */
  key: string
  mod: boolean
  shift: boolean
  alt: boolean
}

export type ShortcutMap = Record<ShortcutId, ShortcutBinding>

export type ShortcutMeta = {
  id: ShortcutId
  label: string
  description: string
}

export const SHORTCUT_DEFS: ShortcutMeta[] = [
  {
    id: 'toggleSidebar',
    label: '展开 / 收起侧边栏',
    description: '在输入框外切换左侧导航栏显示',
  },
  {
    id: 'quoteToAi',
    label: '摘录到 AI 输入框',
    description: '在阅读室选中 MD / 译文文字后导入 AI',
  },
]

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  toggleSidebar: { key: 'b', mod: true, shift: false, alt: false },
  quoteToAi: { key: 'l', mod: true, shift: false, alt: false },
}

const STORAGE_KEY = 'start:keyboard-shortcuts'

type Listener = () => void
const listeners = new Set<Listener>()

function normalizeBinding(raw: unknown, fallback: ShortcutBinding): ShortcutBinding {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const b = raw as Partial<ShortcutBinding>
  const key = typeof b.key === 'string' && b.key.trim() ? b.key.trim().toLowerCase() : fallback.key
  // Block bare modifier-only captures
  if (key === 'control' || key === 'meta' || key === 'alt' || key === 'shift' || key === 'os') {
    return { ...fallback }
  }
  return {
    key,
    mod: typeof b.mod === 'boolean' ? b.mod : fallback.mod,
    shift: Boolean(b.shift),
    alt: Boolean(b.alt),
  }
}

function loadShortcuts(): ShortcutMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SHORTCUTS }
    const parsed = JSON.parse(raw) as Partial<Record<ShortcutId, unknown>>
    return {
      toggleSidebar: normalizeBinding(parsed.toggleSidebar, DEFAULT_SHORTCUTS.toggleSidebar),
      quoteToAi: normalizeBinding(parsed.quoteToAi, DEFAULT_SHORTCUTS.quoteToAi),
    }
  } catch {
    return { ...DEFAULT_SHORTCUTS }
  }
}

let cache: ShortcutMap = loadShortcuts()

function emit() {
  for (const l of listeners) l()
}

function persist(next: ShortcutMap) {
  cache = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  emit()
}

export function getShortcuts(): ShortcutMap {
  return cache
}

export function subscribeShortcuts(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useKeyboardShortcuts(): ShortcutMap {
  return useSyncExternalStore(subscribeShortcuts, getShortcuts, getShortcuts)
}

export function setShortcut(id: ShortcutId, binding: ShortcutBinding) {
  const nextBinding = normalizeBinding(binding, DEFAULT_SHORTCUTS[id])
  const prev = cache[id]
  const next: ShortcutMap = { ...cache, [id]: nextBinding }

  for (const other of Object.keys(next) as ShortcutId[]) {
    if (other === id) continue
    if (sameBinding(next[other], nextBinding)) {
      // Swap with the previous binding of the edited shortcut
      next[other] = { ...prev }
    }
  }

  persist(next)
}

export function resetShortcuts() {
  persist({ ...DEFAULT_SHORTCUTS })
}

export function sameBinding(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    a.mod === b.mod &&
    Boolean(a.shift) === Boolean(b.shift) &&
    Boolean(a.alt) === Boolean(b.alt)
  )
}

export function matchesShortcut(e: KeyboardEvent, binding: ShortcutBinding): boolean {
  if (Boolean(binding.mod) !== Boolean(e.ctrlKey || e.metaKey)) return false
  if (Boolean(binding.shift) !== e.shiftKey) return false
  if (Boolean(binding.alt) !== e.altKey) return false
  return e.key.toLowerCase() === binding.key.toLowerCase()
}

export function bindingFromKeyboardEvent(e: KeyboardEvent): ShortcutBinding | null {
  const key = e.key
  if (!key) return null
  const lower = key.toLowerCase()
  if (lower === 'control' || lower === 'meta' || lower === 'alt' || lower === 'shift' || lower === 'os') {
    return null
  }
  // Require at least one modifier for app-level shortcuts to avoid typing conflicts
  if (!(e.ctrlKey || e.metaKey || e.altKey)) return null
  return {
    key: lower.length === 1 ? lower : lower,
    mod: e.ctrlKey || e.metaKey,
    shift: e.shiftKey,
    alt: e.altKey,
  }
}

export function formatShortcut(binding: ShortcutBinding, platform?: 'mac' | 'win'): string {
  const isMac =
    platform === 'mac' ||
    (platform !== 'win' &&
      typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || ''))

  const parts: string[] = []
  if (binding.mod) parts.push(isMac ? '⌘' : 'Ctrl')
  if (binding.alt) parts.push(isMac ? '⌥' : 'Alt')
  if (binding.shift) parts.push(isMac ? '⇧' : 'Shift')
  const k = binding.key.length === 1 ? binding.key.toUpperCase() : binding.key
  parts.push(k)
  return isMac ? parts.join('') : parts.join('+')
}
