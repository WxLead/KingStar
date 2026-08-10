import { useEffect, useLayoutEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'

function clearHighlights(root: HTMLElement) {
  const marks = root.querySelectorAll('mark.doc-find-hit')
  marks.forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) return
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
    parent.normalize()
  })
}

function collectTextNodes(root: HTMLElement): Text[] {
  const out: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const value = node.nodeValue
      if (!value || !value.trim()) return NodeFilter.FILTER_REJECT
      const el = (node as Text).parentElement
      if (!el) return NodeFilter.FILTER_REJECT
      if (el.closest('mark.doc-find-hit, script, style, .katex, .katex-display')) {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let n: Node | null
  while ((n = walker.nextNode())) out.push(n as Text)
  return out
}

/** Highlight all case-insensitive matches; returns mark elements in document order. */
function applyHighlights(root: HTMLElement, query: string): HTMLElement[] {
  clearHighlights(root)
  const needle = query.trim()
  if (!needle) return []

  const q = needle.toLowerCase()
  const textNodes = collectTextNodes(root)
  const marks: HTMLElement[] = []

  for (const textNode of textNodes) {
    const text = textNode.nodeValue || ''
    const lower = text.toLowerCase()
    const ranges: Array<{ start: number; end: number }> = []
    let from = 0
    while (from < lower.length) {
      const at = lower.indexOf(q, from)
      if (at < 0) break
      ranges.push({ start: at, end: at + needle.length })
      from = at + Math.max(needle.length, 1)
      if (ranges.length + marks.length > 800) break
    }
    if (!ranges.length) continue

    const frag = document.createDocumentFragment()
    let last = 0
    for (const { start, end } of ranges) {
      if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)))
      const mark = document.createElement('mark')
      mark.className = 'doc-find-hit'
      mark.textContent = text.slice(start, end)
      frag.appendChild(mark)
      marks.push(mark)
      last = end
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)))
    textNode.parentNode?.replaceChild(frag, textNode)
  }

  return marks
}

/** In-document find with yellow highlights + scroll to current hit. */
export default function DocFindBar({
  text,
  open,
  onOpenChange,
  scrollParentRef,
}: {
  /** Markdown source — used as a signal that rendered content changed */
  text: string
  open: boolean
  onOpenChange: (open: boolean) => void
  scrollParentRef: React.RefObject<HTMLElement | null>
}) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [matchCount, setMatchCount] = useState(0)

  useEffect(() => {
    setIndex(0)
  }, [query, text])

  useLayoutEffect(() => {
    const scrollEl = scrollParentRef.current
    const root = scrollEl?.querySelector('.md-render') as HTMLElement | null

    if (!open || !root) {
      if (root) clearHighlights(root)
      setMatchCount(0)
      return
    }

    const q = query.trim()
    if (!q) {
      clearHighlights(root)
      setMatchCount(0)
      return
    }

    const marks = applyHighlights(root, q)
    setMatchCount(marks.length)
    if (!marks.length) return

    const active = ((index % marks.length) + marks.length) % marks.length
    marks.forEach((m, i) => {
      m.classList.toggle('doc-find-current', i === active)
    })
    marks[active]?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
  }, [open, query, text, scrollParentRef])

  // Only restyle + scroll when jumping between hits
  useLayoutEffect(() => {
    if (!open) return
    const root = scrollParentRef.current?.querySelector('.md-render') as HTMLElement | null
    if (!root) return
    const marks = Array.from(root.querySelectorAll<HTMLElement>('mark.doc-find-hit'))
    if (!marks.length) return
    const active = ((index % marks.length) + marks.length) % marks.length
    marks.forEach((m, i) => {
      m.classList.toggle('doc-find-current', i === active)
    })
    marks[active]?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
  }, [index, open, scrollParentRef])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onOpenChange(false)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (!matchCount) return
        setIndex((i) =>
          e.shiftKey ? (i - 1 + matchCount) % matchCount : (i + 1) % matchCount,
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, matchCount, onOpenChange])

  useEffect(() => {
    if (open) return
    const root = scrollParentRef.current?.querySelector('.md-render') as HTMLElement | null
    if (root) clearHighlights(root)
  }, [open, scrollParentRef])

  if (!open) return null

  const displayIndex = matchCount ? (index % matchCount) + 1 : 0

  return (
    <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-xl border border-[#e4e6f0] bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur">
      <Search size={13} className="shrink-0 text-[#9aa0b8]" />
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="在文档中查找"
        className="h-7 w-40 bg-transparent text-[13px] text-ink outline-none placeholder:text-[#b0b5c9] sm:w-52"
      />
      <span className="min-w-[3.5rem] text-center text-[11px] tabular-nums text-[#9aa0b8]">
        {matchCount ? `${displayIndex}/${matchCount}` : '0/0'}
      </span>
      <button
        type="button"
        title="上一个"
        disabled={!matchCount}
        onClick={() => setIndex((i) => (i - 1 + matchCount) % matchCount)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6a70a0] hover:bg-[#f3f4fb] disabled:opacity-30"
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        title="下一个"
        disabled={!matchCount}
        onClick={() => setIndex((i) => (i + 1) % matchCount)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6a70a0] hover:bg-[#f3f4fb] disabled:opacity-30"
      >
        <ChevronDown size={14} />
      </button>
      <button
        type="button"
        title="关闭"
        onClick={() => onOpenChange(false)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6a70a0] hover:bg-[#f3f4fb]"
      >
        <X size={14} />
      </button>
    </div>
  )
}
