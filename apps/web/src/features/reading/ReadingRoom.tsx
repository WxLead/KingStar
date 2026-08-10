import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, BookOpen, Highlighter, Search, Pencil } from 'lucide-react'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { FilePreview } from '@/features/parse/ParseWorkspace'
import PaperMetaDialog from '@/features/library/PaperMetaDialog'
import { attachQuoteToAi } from '@/features/reading/aiQuoteBridge'
import AnnotationSelectionToolbar, {
  AnnotationsListPanel,
} from '@/features/reading/AnnotationChrome'
import {
  applyAnnotationMarks,
  clearAnnotationMarks,
  clearDraftSelection,
  pinSelectionAsDraft,
  scrollToAnnotation,
  type SelectionQuote,
} from '@/features/reading/annotationDom'
import { fetchAnnotations, saveAnnotations } from '@/features/reading/annotationsStorage'
import {
  newAnnotationId,
  type Annotation,
  type AnnotationSource,
} from '@/features/reading/annotationsTypes'
import DocFindBar from '@/features/reading/DocFindBar'
import { getShortcuts, matchesShortcut } from '@/features/settings/keyboardShortcuts'
import ReadingMarkdown from '@/features/reading/ReadingMarkdown'
import ReadingPaneHeader, { PaneFrame } from '@/features/reading/ReadingPaneHeader'
import { AiPane, NotesPane } from '@/features/reading/ReadingSidePanel'
import { useUploads } from '@/features/uploads/UploadsContext'
import {
  loadParseArtifacts,
  paperDisplayTitle,
  type UploadItem,
} from '@/services/api'

export type ReadingView = 'original' | 'md' | 'zh'

type PaneId = 'literature' | 'notes' | 'ai'

const LAYOUT_KEY = 'start:reading-panel-layout'
const COLLAPSED_KEY = 'start:reading-panel-collapsed'
const DEFAULT_LAYOUT = { literature: 34, notes: 33, ai: 33 }
const COLLAPSED_PX = 44
const COLLAPSED_SIZE = '44px'

function loadLayout(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return { ...DEFAULT_LAYOUT }
    const parsed = JSON.parse(raw) as Record<string, number>
    if (
      typeof parsed.literature === 'number' &&
      typeof parsed.notes === 'number' &&
      typeof parsed.ai === 'number'
    ) {
      // Ignore corrupt near-zero layouts from earlier collapse bugs
      if (parsed.literature < 4 || parsed.notes < 4 || parsed.ai < 4) {
        return { ...DEFAULT_LAYOUT }
      }
      return parsed
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_LAYOUT }
}

function loadCollapsed(): Record<PaneId, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    if (!raw) return { literature: false, notes: false, ai: false }
    const parsed = JSON.parse(raw) as Partial<Record<PaneId, boolean>>
    return {
      literature: Boolean(parsed.literature),
      notes: Boolean(parsed.notes),
      ai: Boolean(parsed.ai),
    }
  } catch {
    return { literature: false, notes: false, ai: false }
  }
}

function saveCollapsed(state: Record<PaneId, boolean>) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

function TabBtn({
  active,
  disabled,
  onClick,
  children,
  title,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-10 items-center justify-center px-4 text-[13px] font-semibold tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'text-[#4f46e5]' : 'text-[#6a70a0] hover:text-ink'
      }`}
    >
      {children}
      <span
        aria-hidden
        className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full transition ${
          active ? 'bg-[#4f46e5] opacity-100' : 'bg-transparent opacity-0'
        }`}
      />
    </button>
  )
}

export default function ReadingRoom({ item }: { item: UploadItem }) {
  const navigate = useNavigate()
  const { refresh } = useUploads()
  const taskId = item.last_task_id

  const [view, setView] = useState<ReadingView>('original')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [zhMarkdown, setZhMarkdown] = useState<string | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [metaOpen, setMetaOpen] = useState(false)
  const [annoOpen, setAnnoOpen] = useState(false)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [activeAnnoId, setActiveAnnoId] = useState<string | null>(null)
  const [selQuote, setSelQuote] = useState<SelectionQuote | null>(null)
  const defaultLayout = useMemo(() => loadLayout(), [])
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const [resizing, setResizing] = useState(false)

  const litRef = useRef<PanelImperativeHandle | null>(null)
  const notesRef = useRef<PanelImperativeHandle | null>(null)
  const aiRef = useRef<PanelImperativeHandle | null>(null)
  const restoredRef = useRef(false)
  const noteSaveTimer = useRef<number | null>(null)
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations

  const scrollRef = useRef<HTMLDivElement>(null)
  const goToPageRef = useRef<((page: number) => void) | null>(null)

  const hasMd = Boolean(markdown.trim())
  const hasZh = Boolean(zhMarkdown?.trim())
  const annoSource: AnnotationSource | null =
    view === 'zh' ? 'zh' : view === 'md' ? 'md' : null
  const visibleAnnos = useMemo(
    () =>
      annotations
        .filter((a) => a.source === 'md' || a.source === 'zh')
        .sort((a, b) => b.createdAt - a.createdAt),
    [annotations],
  )
  const annoMarkKey = useMemo(
    () =>
      annotations
        .map((a) => `${a.id}\0${a.source}\0${a.quote}\0${a.color}`)
        .join('\n'),
    [annotations],
  )

  const persistAnnos = useCallback(
    async (items: Annotation[]) => {
      await saveAnnotations(item.upload_id, items)
    },
    [item.upload_id],
  )

  const updateAnnos = useCallback(
    (next: Annotation[] | ((prev: Annotation[]) => Annotation[])) => {
      setAnnotations((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next
        void persistAnnos(resolved)
        return resolved
      })
    },
    [persistAnnos],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const doc = await fetchAnnotations(item.upload_id)
      if (!cancelled) setAnnotations(doc.items)
    })()
    return () => {
      cancelled = true
    }
  }, [item.upload_id])

  // Re-apply annotation marks when MD/ZH content or list changes (skip while find is open)
  useLayoutEffect(() => {
    const root = scrollRef.current
    if (!root || !annoSource) return
    const article = root.querySelector('.md-render') as HTMLElement | null
    if (!article) return
    if (findOpen) {
      clearAnnotationMarks(article)
      return
    }
    applyAnnotationMarks(article, annotationsRef.current, annoSource)
  }, [annoMarkKey, annoSource, markdown, zhMarkdown, findOpen, view])

  // Selection toolbar for MD/ZH — take over native selection to hide browser chrome
  useEffect(() => {
    if (view !== 'md' && view !== 'zh') {
      setSelQuote(null)
      return
    }

    const dismissDraft = () => {
      const root = scrollRef.current
      const article = root?.querySelector('.md-render') as HTMLElement | null
      if (article) clearDraftSelection(article)
      setSelQuote(null)
      window.getSelection()?.removeAllRanges()
    }

    const onPointerUp = (e: PointerEvent) => {
      const root = scrollRef.current
      if (!root) return
      const t = e.target
      if (!(t instanceof Node) || !root.contains(t)) {
        dismissDraft()
        return
      }
      const el = t instanceof Element ? t : t.parentElement
      // Clicks on our toolbar should not re-capture
      if (el?.closest('[data-anno-toolbar]')) return
      if (!el?.closest('.md-render')) {
        dismissDraft()
        return
      }

      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) {
        dismissDraft()
        return
      }

      // Take over: suppress browser selection chrome (Edge mini menu, etc.)
      e.preventDefault()

      window.setTimeout(() => {
        const q = pinSelectionAsDraft(root)
        setSelQuote(q)
      }, 0)
    }

    const onContextMenu = (e: MouseEvent) => {
      const root = scrollRef.current
      if (!root) return
      const t = e.target
      if (!(t instanceof Node) || !root.contains(t)) return
      const el = t instanceof Element ? t : t.parentElement
      if (!el?.closest('.md-render')) return
      // Prefer our annotation flow over browser context menu while selecting
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed) {
        e.preventDefault()
        const q = pinSelectionAsDraft(root)
        setSelQuote(q)
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissDraft()
    }

    const onScroll = () => dismissDraft()

    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('keydown', onKeyDown)
    scrollRef.current?.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('keydown', onKeyDown)
      scrollRef.current?.removeEventListener('scroll', onScroll)
    }
    // selQuote intentionally omitted — dismiss uses functional close via setState
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  const dismissSelectionUi = () => {
    const root = scrollRef.current
    const article = root?.querySelector('.md-render') as HTMLElement | null
    if (article) clearDraftSelection(article)
    setSelQuote(null)
    window.getSelection()?.removeAllRanges()
  }

  const addAnnotation = (withNotePrompt: boolean) => {
    if (!selQuote || !annoSource) return
    let note = ''
    if (withNotePrompt) {
      note = window.prompt('批注内容（可留空）', '') ?? ''
    }
    const anno: Annotation = {
      id: newAnnotationId(),
      source: annoSource,
      quote: selQuote.quote,
      prefix: selQuote.prefix,
      suffix: selQuote.suffix,
      note: note.trim(),
      color: 'yellow',
      createdAt: Date.now(),
    }
    // Drop draft before permanent marks are applied
    dismissSelectionUi()
    updateAnnos((prev) => [anno, ...prev])
    setActiveAnnoId(anno.id)
    setAnnoOpen(true)
  }

  const jumpToAnno = (id: string) => {
    const target = annotations.find((a) => a.id === id)
    if (!target) return
    if (view !== target.source) setView(target.source)
    setActiveAnnoId(id)
    // allow view switch + remount before scroll
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        const root = scrollRef.current
        const article = root?.querySelector('.md-render') as HTMLElement | null
        if (!article) return
        applyAnnotationMarks(article, annotations, target.source)
        scrollToAnnotation(article, id)
      }, 50)
    })
  }

  const onChangeAnnoNote = (id: string, note: string) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, note } : a)))
    if (noteSaveTimer.current) window.clearTimeout(noteSaveTimer.current)
    noteSaveTimer.current = window.setTimeout(() => {
      setAnnotations((prev) => {
        void persistAnnos(prev)
        return prev
      })
    }, 400)
  }

  useEffect(() => {
    if (!taskId) {
      setMarkdown('')
      setZhMarkdown(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const arts = await loadParseArtifacts(taskId)
        if (cancelled) return
        setMarkdown(arts.markdown || '')
        setZhMarkdown(arts.zhMarkdown)
        if (arts.zhMarkdown?.trim()) setView('zh')
        else if (arts.markdown?.trim()) setView('md')
        else setView('original')
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载阅读内容失败')
          setMarkdown('')
          setZhMarkdown(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [taskId])

  // Restore collapsed panes after panels mount
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const saved = loadCollapsed()
    const openCount = (['literature', 'notes', 'ai'] as PaneId[]).filter((k) => !saved[k]).length
    // Never restore all-collapsed
    const safe =
      openCount === 0
        ? { literature: false, notes: false, ai: false }
        : saved
    setCollapsed(safe)
    requestAnimationFrame(() => {
      if (safe.literature) litRef.current?.collapse()
      if (safe.notes) notesRef.current?.collapse()
      if (safe.ai) aiRef.current?.collapse()
    })
  }, [])

  useEffect(() => {
    saveCollapsed(collapsed)
  }, [collapsed])

  useEffect(() => {
    if (!resizing) return
    const end = () => setResizing(false)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [resizing])

  // Ctrl/Cmd+L: attach MD/译文 selection to AI composer (Cursor-style)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (view !== 'md' && view !== 'zh') return
      if (!matchesShortcut(e, getShortcuts().quoteToAi)) return

      const root = scrollRef.current
      if (!root) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return

      const range = sel.getRangeAt(0)
      const common = range.commonAncestorContainer
      const node = common.nodeType === Node.TEXT_NODE ? common.parentElement : (common as Element)
      if (!node || !root.contains(node)) return
      if (!node.closest?.('.md-render')) return

      const text = sel.toString().replace(/\s+/g, ' ').trim()
      if (!text) return

      e.preventDefault()
      e.stopPropagation()
      attachQuoteToAi({ text, source: view === 'zh' ? 'zh' : 'md' })
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [view])

  // Ctrl/Cmd+F: in-document find (MD / 译文)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      if (e.key.toLowerCase() !== 'f') return
      if (view !== 'md' && view !== 'zh') return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      setFindOpen(true)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [view])

  useEffect(() => {
    if (view !== 'md' && view !== 'zh') setFindOpen(false)
  }, [view])

  const openWorkspace = () => {
    navigate('/')
  }

  const openLibrary = () => {
    navigate('/library')
  }

  const displayTitle = paperDisplayTitle(item)

  const setPaneCollapsed = (id: PaneId, value: boolean) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: value }
      if (value) {
        const openLeft = (['literature', 'notes', 'ai'] as PaneId[]).filter((k) => !next[k])
        if (openLeft.length === 0) return prev
      }
      return next
    })
  }

  const collapsePane = (id: PaneId) => {
    const openCount = (['literature', 'notes', 'ai'] as PaneId[]).filter((k) => !collapsed[k]).length
    if (openCount <= 1 && !collapsed[id]) return
    const ref = id === 'literature' ? litRef : id === 'notes' ? notesRef : aiRef
    // Width animates first; rail swaps in via onResize when size hits collapsedSize
    ref.current?.collapse()
  }

  const expandPane = (id: PaneId) => {
    const ref = id === 'literature' ? litRef : id === 'notes' ? notesRef : aiRef
    // Reveal content immediately, then grow width
    setPaneCollapsed(id, false)
    requestAnimationFrame(() => {
      ref.current?.expand()
    })
  }

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-[#e8e9f4] bg-[#f8f8fd]">
      <header className="relative flex shrink-0 flex-wrap items-center gap-3 overflow-hidden border-b border-[#eceef6] bg-gradient-to-r from-white via-[#f8f8fd] to-[#eef0fb] px-5 py-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#c7c9ef] to-transparent"
        />
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b91b3]">
            阅读室
          </p>
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] text-white shadow-sm shadow-[#4f46e5]/25">
              <BookOpen size={17} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <h1
                className="font-display min-w-0 truncate text-[22px] leading-tight tracking-wide text-[#1e2a52]"
                title={displayTitle}
              >
                {displayTitle}
              </h1>
              <p className="mt-0.5 truncate text-[12px] text-[#9aa0b8]">
                {item.venue
                  ? `${item.venue_type === 'conference' ? '会议' : item.venue_type === 'journal' ? '期刊' : ''}${item.venue_type ? ' · ' : ''}${item.venue}${item.year ? ` · ${item.year}` : ''}`
                  : item.filename}
              </p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMetaOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#e4e6f0] bg-white px-3 text-[12px] font-semibold text-[#6a70a0] transition hover:border-[#c7c9ef] hover:text-[#4f46e5]"
          >
            <Pencil size={14} />
            文献信息
          </button>
          <button
            type="button"
            onClick={openLibrary}
            className="group relative inline-flex shrink-0 items-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-br from-[#4f46e5] to-[#6366f1] px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.7)] transition duration-200 hover:-translate-y-0.5 hover:from-[#4338ca] hover:to-[#4f46e5] hover:shadow-[0_12px_26px_-10px_rgba(79,70,229,0.8)] active:translate-y-0"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.28),transparent_50%)]"
            />
            <ArrowLeft size={15} strokeWidth={2.5} className="relative shrink-0" />
            <span className="relative tracking-wide">返回文献</span>
          </button>
        </div>
      </header>

      <ResizablePanelGroup
        orientation="horizontal"
        className={`reading-panels min-h-0 flex-1 ${resizing ? 'is-resizing' : ''}`}
        defaultLayout={defaultLayout}
        onLayoutChanged={(layout) => {
          try {
            localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
          } catch {
            /* ignore */
          }
        }}
      >
        <ResizablePanel
          id="literature"
          panelRef={litRef}
          collapsible
          collapsedSize={COLLAPSED_SIZE}
          minSize="18"
          className="min-w-0 overflow-hidden"
          onResize={(size) => {
            const isCol = size.inPixels <= COLLAPSED_PX + 8
            if (isCol && collapsed.notes && collapsed.ai) {
              litRef.current?.expand()
              setPaneCollapsed('literature', false)
              return
            }
            setPaneCollapsed('literature', isCol)
          }}
        >
          <PaneFrame
            collapsed={collapsed.literature}
            label="文献"
            onExpand={() => expandPane('literature')}
          >
            <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
              <ReadingPaneHeader
                title="文献"
                onCollapse={() => collapsePane('literature')}
                actions={
                  (view === 'md' || view === 'zh') ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        title="标注"
                        onClick={() => setAnnoOpen((v) => !v)}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
                          annoOpen
                            ? 'bg-[#eef0fb] text-[#4f46e5]'
                            : 'text-[#6a70a0] hover:bg-[#eef0fb] hover:text-[#4f46e5]'
                        }`}
                      >
                        <Highlighter size={14} />
                      </button>
                      <button
                        type="button"
                        title="查找 (Ctrl+F)"
                        onClick={() => setFindOpen(true)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6a70a0] transition hover:bg-[#eef0fb] hover:text-[#4f46e5]"
                      >
                        <Search size={14} />
                      </button>
                    </div>
                  ) : null
                }
              />

              <div className="flex h-10 shrink-0 items-center justify-center border-b border-[#eceef6] bg-[#f3f4fb] px-2">
                <div
                  role="tablist"
                  aria-label="文献视图"
                  className="inline-flex h-10 items-stretch"
                >
                  <TabBtn active={view === 'original'} onClick={() => setView('original')}>
                    原文
                  </TabBtn>
                  <TabBtn
                    active={view === 'md'}
                    disabled={!hasMd && !loading}
                    title={!hasMd ? '请先完成版面分析' : undefined}
                    onClick={() => setView('md')}
                  >
                    MD
                  </TabBtn>
                  <TabBtn
                    active={view === 'zh'}
                    disabled={!hasZh}
                    title={!hasZh ? '请先翻译' : undefined}
                    onClick={() => setView('zh')}
                  >
                    译文
                  </TabBtn>
                </div>
              </div>

              <div className="relative min-h-0 flex-1 overflow-hidden">
                {(view === 'md' || view === 'zh') && (
                  <DocFindBar
                    text={view === 'zh' ? zhMarkdown || '' : markdown}
                    open={findOpen}
                    onOpenChange={setFindOpen}
                    scrollParentRef={scrollRef}
                  />
                )}
                {selQuote && (view === 'md' || view === 'zh') ? (
                  <AnnotationSelectionToolbar
                    rect={selQuote.rect}
                    onHighlight={() => addAnnotation(false)}
                    onNote={() => addAnnotation(true)}
                    onClose={dismissSelectionUi}
                  />
                ) : null}
                {loading && (
                  <p className="absolute inset-x-0 top-8 z-10 text-center text-[14px] text-[#9aa0b8]">
                    加载阅读内容…
                  </p>
                )}
                {error && (
                  <p className="absolute inset-x-0 top-8 z-10 text-center text-[14px] text-[#b45309]">
                    {error}
                  </p>
                )}

                {!taskId && (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                    <p className="text-[15px] text-ink-soft">该文件尚未解析，无法进入阅读内容。</p>
                    <button
                      type="button"
                      onClick={openWorkspace}
                      className="rounded-xl bg-[#4f46e5] px-4 py-2 text-[13px] font-semibold text-white"
                    >
                      去工作区解析
                    </button>
                  </div>
                )}

                {taskId && (
                  <div className="flex h-full min-h-0">
                    <div ref={scrollRef} className="scrollbar-hidden min-h-0 min-w-0 flex-1 overflow-y-auto">
                      {view === 'original' && (
                        <FilePreview
                          item={item}
                          zoom={100}
                          scrollParentRef={scrollRef}
                          goToPageRef={goToPageRef}
                        />
                      )}
                      {view === 'md' && (
                        <ReadingMarkdown
                          markdown={markdown}
                          taskId={taskId}
                          emptyHint="暂无 Markdown，请先完成版面分析"
                        />
                      )}
                      {view === 'zh' && (
                        <ReadingMarkdown
                          markdown={zhMarkdown || ''}
                          taskId={taskId}
                          emptyHint="请先翻译"
                        />
                      )}
                    </div>
                    {annoOpen && (view === 'md' || view === 'zh') ? (
                      <aside className="flex w-[220px] shrink-0 flex-col border-l border-[#eceef6] bg-[#fafbff]">
                        <div className="flex items-center justify-between border-b border-[#eceef6] px-3 py-2">
                          <p className="text-[12px] font-bold text-[#2f3358]">
                            标注
                            <span className="ml-1 font-semibold text-[#9aa0b8]">
                              {visibleAnnos.length}
                            </span>
                          </p>
                          <button
                            type="button"
                            onClick={() => setAnnoOpen(false)}
                            className="text-[11px] font-semibold text-[#9aa0b8] hover:text-[#4f46e5]"
                          >
                            收起
                          </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto">
                          <AnnotationsListPanel
                            items={visibleAnnos}
                            activeId={activeAnnoId}
                            onJump={jumpToAnno}
                            onDelete={(id) => {
                              updateAnnos((prev) => prev.filter((a) => a.id !== id))
                              if (activeAnnoId === id) setActiveAnnoId(null)
                            }}
                            onChangeNote={onChangeAnnoNote}
                          />
                        </div>
                      </aside>
                    ) : null}
                  </div>
                )}
              </div>
            </section>
          </PaneFrame>
        </ResizablePanel>

        <ResizableHandle
          onPointerDown={() => setResizing(true)}
          className="w-1.5 bg-[#eceef6] transition-colors duration-150 hover:bg-[#c7c9ef] data-[separator=active]:bg-[#a5a8e0]"
        />

        <ResizablePanel
          id="notes"
          panelRef={notesRef}
          collapsible
          collapsedSize={COLLAPSED_SIZE}
          minSize="15"
          className="min-w-0 overflow-hidden"
          onResize={(size) => {
            const isCol = size.inPixels <= COLLAPSED_PX + 8
            if (isCol && collapsed.literature && collapsed.ai) {
              notesRef.current?.expand()
              setPaneCollapsed('notes', false)
              return
            }
            setPaneCollapsed('notes', isCol)
          }}
        >
          <PaneFrame
            collapsed={collapsed.notes}
            label="笔记"
            onExpand={() => expandPane('notes')}
          >
            <NotesPane
              uploadId={item.upload_id}
              filename={item.filename}
              onCollapse={() => collapsePane('notes')}
            />
          </PaneFrame>
        </ResizablePanel>

        <ResizableHandle
          onPointerDown={() => setResizing(true)}
          className="w-1.5 bg-[#eceef6] transition-colors duration-150 hover:bg-[#c7c9ef] data-[separator=active]:bg-[#a5a8e0]"
        />

        <ResizablePanel
          id="ai"
          panelRef={aiRef}
          collapsible
          collapsedSize={COLLAPSED_SIZE}
          minSize="15"
          className="min-w-0 overflow-hidden"
          onResize={(size) => {
            const isCol = size.inPixels <= COLLAPSED_PX + 8
            if (isCol && collapsed.literature && collapsed.notes) {
              aiRef.current?.expand()
              setPaneCollapsed('ai', false)
              return
            }
            setPaneCollapsed('ai', isCol)
          }}
        >
          <PaneFrame
            collapsed={collapsed.ai}
            label="AI 解读"
            onExpand={() => expandPane('ai')}
          >
            <AiPane
              uploadId={item.upload_id}
              filename={item.filename}
              markdown={markdown}
              zhMarkdown={zhMarkdown}
              onCollapse={() => collapsePane('ai')}
            />
          </PaneFrame>
        </ResizablePanel>
      </ResizablePanelGroup>

      <PaperMetaDialog
        item={item}
        open={metaOpen}
        onOpenChange={setMetaOpen}
        onSaved={() => void refresh()}
      />
    </div>
  )
}
