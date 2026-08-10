/** DOM helpers: apply / clear / scroll annotation marks in .md-render */

import type { Annotation } from '@/features/reading/annotationsTypes'

const ANNO_SELECTOR = 'mark.anno-hit'

export function clearAnnotationMarks(root: HTMLElement) {
  const marks = root.querySelectorAll(ANNO_SELECTOR)
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
      if (el.closest('mark.anno-hit, mark.doc-find-hit, script, style, .katex, .katex-display')) {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let n: Node | null
  while ((n = walker.nextNode())) out.push(n as Text)
  return out
}

function wrapRangeInNode(
  textNode: Text,
  start: number,
  end: number,
  anno: Annotation,
): HTMLElement | null {
  const text = textNode.nodeValue || ''
  if (start < 0 || end > text.length || start >= end) return null
  const frag = document.createDocumentFragment()
  if (start > 0) frag.appendChild(document.createTextNode(text.slice(0, start)))
  const mark = document.createElement('mark')
  mark.className = `anno-hit anno-${anno.color}`
  mark.dataset.annoId = anno.id
  mark.title = anno.note || anno.quote
  mark.textContent = text.slice(start, end)
  frag.appendChild(mark)
  if (end < text.length) frag.appendChild(document.createTextNode(text.slice(end)))
  textNode.parentNode?.replaceChild(frag, textNode)
  return mark
}

/** Score candidate match using prefix/suffix context. */
function contextScore(
  full: string,
  at: number,
  quoteLen: number,
  prefix: string,
  suffix: string,
): number {
  let score = 0
  if (prefix) {
    const before = full.slice(Math.max(0, at - prefix.length), at)
    if (before === prefix) score += 3
    else if (before.endsWith(prefix.slice(-Math.min(8, prefix.length)))) score += 1
  }
  if (suffix) {
    const after = full.slice(at + quoteLen, at + quoteLen + suffix.length)
    if (after === suffix) score += 3
    else if (after.startsWith(suffix.slice(0, Math.min(8, suffix.length)))) score += 1
  }
  return score
}

/**
 * Apply marks for annotations of the current source.
 * Matches quote within single text nodes (MVP); uses prefix/suffix to pick best hit.
 */
export function applyAnnotationMarks(
  root: HTMLElement,
  annotations: Annotation[],
  source: 'md' | 'zh',
): void {
  clearDraftSelection(root)
  clearAnnotationMarks(root)
  const list = annotations.filter((a) => a.source === source && a.quote.trim())
  if (!list.length) return

  for (const anno of list) {
    const quote = anno.quote
    const textNodes = collectTextNodes(root)
    type Cand = { node: Text; start: number; end: number; score: number }
    const cands: Cand[] = []

    for (const node of textNodes) {
      const text = node.nodeValue || ''
      let from = 0
      while (from < text.length) {
        const at = text.indexOf(quote, from)
        if (at < 0) break
        // Build local context from neighboring nodes for scoring
        const full = text
        const score = contextScore(full, at, quote.length, anno.prefix, anno.suffix)
        cands.push({ node, start: at, end: at + quote.length, score })
        from = at + Math.max(quote.length, 1)
        if (cands.length > 40) break
      }
    }

    if (!cands.length) continue
    cands.sort((a, b) => b.score - a.score)
    const best = cands[0]
    wrapRangeInNode(best.node, best.start, best.end, anno)
  }
}

export function scrollToAnnotation(root: HTMLElement, id: string): boolean {
  const safe =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(id)
      : id.replace(/["\\]/g, '\\$&')
  const el = root.querySelector(`${ANNO_SELECTOR}[data-anno-id="${safe}"]`) as HTMLElement | null
  if (!el) return false
  root.querySelectorAll(`${ANNO_SELECTOR}.anno-current`).forEach((m) => m.classList.remove('anno-current'))
  el.classList.add('anno-current')
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  return true
}

export type SelectionQuote = {
  quote: string
  prefix: string
  suffix: string
  rect: DOMRect
}

export function clearDraftSelection(root: HTMLElement) {
  const marks = root.querySelectorAll('mark.anno-draft')
  marks.forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) return
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
    parent.normalize()
  })
}

/** Capture a text selection inside root as a quote anchor. */
export function captureSelectionQuote(root: HTMLElement): SelectionQuote | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  const common = range.commonAncestorContainer
  const el =
    common.nodeType === Node.ELEMENT_NODE
      ? (common as HTMLElement)
      : common.parentElement
  if (!el || !root.contains(el) || !el.closest('.md-render')) return null

  const quote = sel.toString().trim()
  if (!quote || quote.length < 2 || quote.length > 2000) return null

  // Context from surrounding text content of the article
  const article = (root.querySelector('.md-render') as HTMLElement) || root
  const full = article.textContent || ''
  const idx = full.indexOf(quote)
  let prefix = ''
  let suffix = ''
  if (idx >= 0) {
    prefix = full.slice(Math.max(0, idx - 24), idx)
    suffix = full.slice(idx + quote.length, idx + quote.length + 24)
  }

  const rect = range.getBoundingClientRect()
  return { quote, prefix, suffix, rect }
}

/**
 * Take over the native browser selection: wrap in a draft mark and clear
 * window.getSelection() so OS/browser selection UI (Edge mini menu, etc.) dismisses.
 */
export function pinSelectionAsDraft(root: HTMLElement): SelectionQuote | null {
  const article = (root.querySelector('.md-render') as HTMLElement) || root
  clearDraftSelection(article)

  const captured = captureSelectionQuote(root)
  if (!captured) return null

  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return captured

  const range = sel.getRangeAt(0)
  let mark: HTMLElement | null = null
  try {
    mark = document.createElement('mark')
    mark.className = 'anno-draft'
    range.surroundContents(mark)
  } catch {
    try {
      mark = document.createElement('mark')
      mark.className = 'anno-draft'
      const frag = range.extractContents()
      mark.appendChild(frag)
      range.insertNode(mark)
    } catch {
      mark = null
    }
  }

  // Drop native selection to suppress browser default selection chrome
  sel.removeAllRanges()

  if (mark && mark.isConnected) {
    return { ...captured, rect: mark.getBoundingClientRect() }
  }
  return captured
}
