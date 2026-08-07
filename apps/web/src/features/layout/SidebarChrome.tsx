import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  formatShortcut,
  getShortcuts,
  matchesShortcut,
  subscribeShortcuts,
} from '@/features/settings/keyboardShortcuts'

const STORAGE_KEY = 'start:sidebar-open'

type SidebarChromeCtx = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

const Ctx = createContext<SidebarChromeCtx | null>(null)

export function SidebarChromeProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpenState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw === null) return true
      return raw !== '0'
    } catch {
      return true
    }
  })

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [])

  const toggle = useCallback(() => setOpen(!open), [open, setOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const binding = getShortcuts().toggleSidebar
      if (!matchesShortcut(e, binding)) return
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable ||
          t.closest('[contenteditable="true"]') ||
          t.closest('.ProseMirror'))
      ) {
        return
      }
      e.preventDefault()
      setOpenState((prev) => {
        const next = !prev
        try {
          localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
        } catch {
          /* ignore */
        }
        return next
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Keep subscribers warm so settings changes don't leave stale closures elsewhere
  useEffect(() => subscribeShortcuts(() => {}), [])

  const value = useMemo(() => ({ open, setOpen, toggle }), [open, setOpen, toggle])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSidebarChrome() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSidebarChrome must be used within SidebarChromeProvider')
  return ctx
}

export function useToggleSidebarShortcutLabel(): string {
  const [label, setLabel] = useState(() => formatShortcut(getShortcuts().toggleSidebar))
  useEffect(() => {
    return subscribeShortcuts(() => {
      setLabel(formatShortcut(getShortcuts().toggleSidebar))
    })
  }, [])
  return label
}
