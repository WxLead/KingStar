import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Eraser, MessageSquarePlus } from 'lucide-react'

export type AiSlashCommand = {
  id: 'new' | 'clear'
  title: string
  /** Shown as /alias */
  aliases: string[]
  description: string
  icon: ReactNode
}

export const AI_SLASH_COMMANDS: AiSlashCommand[] = [
  {
    id: 'new',
    title: '新开对话',
    aliases: ['new', 'xk', 'xinkai', '新开'],
    description: '新建会话，当前对话保留到历史',
    icon: <MessageSquarePlus size={16} />,
  },
  {
    id: 'clear',
    title: '清空聊天',
    aliases: ['clear', 'qk', 'qingkong', '清空'],
    description: '清空当前窗口内容',
    icon: <Eraser size={16} />,
  },
]

const MAX_VISIBLE = 4
/** Approx row height incl. padding — keeps max 4 rows before scroll */
const ROW_HEIGHT = 44
const MENU_PAD = 8
const VIEW_GAP = 8
const ANCHOR_GAP = 6

/** Returns slash query if input is a command draft (starts with `/`, single token). */
export function parseAiSlashDraft(input: string): { open: boolean; query: string } | null {
  if (!input.startsWith('/') || input.includes('\n')) return null
  const m = input.match(/^\/([^\s]*)$/)
  if (!m) return null
  return { open: true, query: m[1].toLowerCase() }
}

export function filterAiSlashCommands(query: string): AiSlashCommand[] {
  const q = query.trim().toLowerCase().replace(/^\//, '')
  if (!q) return AI_SLASH_COMMANDS
  return AI_SLASH_COMMANDS.filter((item) => {
    const hay = [item.title, item.description, item.id, ...item.aliases].join(' ').toLowerCase()
    return (
      hay.includes(q) ||
      item.id.startsWith(q) ||
      item.aliases.some((a) => a.toLowerCase().startsWith(q))
    )
  })
}

/** Resolve exact command from full input like `/new` or `/clear`. */
export function matchAiSlashCommand(input: string): AiSlashCommand | null {
  const t = input.trim().toLowerCase()
  if (!t.startsWith('/')) return null
  const body = t.slice(1).trim()
  if (!body || body.includes(' ')) return null
  return (
    AI_SLASH_COMMANDS.find(
      (c) => c.id === body || c.aliases.some((a) => a.toLowerCase() === body),
    ) ?? null
  )
}

function estimateMenuHeight(itemCount: number): number {
  const rows = Math.max(1, Math.min(itemCount || 1, MAX_VISIBLE))
  return rows * ROW_HEIGHT + MENU_PAD
}

type MenuPos = {
  top: number
  left: number
  width: number
  placement: 'above' | 'below'
  maxHeight: number
}

function computeMenuPos(anchor: DOMRect, itemCount: number): MenuPos {
  const menuHeight = estimateMenuHeight(itemCount)
  const width = Math.min(Math.max(anchor.width, 240), 320)
  let left = anchor.left
  if (left + width > window.innerWidth - VIEW_GAP) {
    left = Math.max(VIEW_GAP, window.innerWidth - VIEW_GAP - width)
  }
  left = Math.max(VIEW_GAP, left)

  const spaceBelow = window.innerHeight - anchor.bottom - VIEW_GAP
  const spaceAbove = anchor.top - VIEW_GAP
  const placement: 'above' | 'below' =
    spaceBelow >= menuHeight || spaceBelow >= spaceAbove ? 'below' : 'above'

  const maxHeight = Math.min(
    menuHeight,
    placement === 'below' ? Math.max(ROW_HEIGHT + MENU_PAD, spaceBelow) : Math.max(ROW_HEIGHT + MENU_PAD, spaceAbove),
  )

  const top =
    placement === 'below'
      ? anchor.bottom + ANCHOR_GAP
      : Math.max(VIEW_GAP, anchor.top - ANCHOR_GAP - maxHeight)

  return { top, left, width, placement, maxHeight }
}

/** Floating slash menu — portaled to document.body, flips above/below the anchor. */
export function AiSlashMenu({
  open,
  anchorRef,
  items,
  selectedIndex,
  onSelect,
  onHover,
}: {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  items: AiSlashCommand[]
  selectedIndex: number
  onSelect: (item: AiSlashCommand) => void
  onHover: (index: number) => void
}) {
  const [pos, setPos] = useState<MenuPos | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }

    const update = () => {
      const el = anchorRef.current
      if (!el) return
      setPos(computeMenuPos(el.getBoundingClientRect(), items.length))
    }

    update()
    window.addEventListener('resize', update)
    // capture scroll from nested panels
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, items.length, anchorRef, selectedIndex])

  if (!open || typeof document === 'undefined') return null

  const body =
    !items.length ? (
      <div className="rounded-xl border border-[#e4e6f0] bg-white px-3 py-2.5 text-[12px] text-[#9aa0b8] shadow-[0_16px_48px_-16px_rgba(30,42,82,0.45)]">
        无匹配命令
      </div>
    ) : (
      <div
        className="overflow-y-auto rounded-xl border border-[#e4e6f0] bg-white p-1 shadow-[0_16px_48px_-16px_rgba(30,42,82,0.45)]"
        style={{ maxHeight: pos?.maxHeight ?? estimateMenuHeight(MAX_VISIBLE) }}
      >
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => onHover(index)}
            onClick={() => onSelect(item)}
            className={`flex h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition ${
              index === selectedIndex ? 'bg-[#eef0fb] text-[#4f46e5]' : 'text-ink hover:bg-[#f5f6fb]'
            }`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                index === selectedIndex ? 'bg-white text-[#4f46e5]' : 'bg-[#f3f4fb] text-[#6a70a0]'
              }`}
            >
              {item.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold leading-tight">{item.title}</span>
              <span className="mt-0.5 block truncate text-[11px] text-[#9aa0b8]">
                /{item.aliases[0]} · {item.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    )

  if (!pos) return null

  return createPortal(
    <div
      data-ai-slash-menu
      className="pointer-events-auto fixed z-[9999]"
      style={{
        top: pos.top,
        left: pos.left,
        width: pos.width,
      }}
      role="listbox"
    >
      {body}
    </div>,
    document.body,
  )
}
