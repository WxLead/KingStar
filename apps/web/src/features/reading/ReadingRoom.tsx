import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, BookOpen } from 'lucide-react'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { FilePreview } from '@/features/parse/ParseWorkspace'
import { attachQuoteToAi } from '@/features/reading/aiQuoteBridge'
import { getShortcuts, matchesShortcut } from '@/features/settings/keyboardShortcuts'
import ReadingMarkdown from '@/features/reading/ReadingMarkdown'
import ReadingPaneHeader, { CollapsedPaneRail } from '@/features/reading/ReadingPaneHeader'
import { AiPane, NotesPane } from '@/features/reading/ReadingSidePanel'
import { loadParseArtifacts, type UploadItem } from '@/services/api'

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
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-white text-[#4f46e5] shadow-sm' : 'text-[#6a70a0] hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

export default function ReadingRoom({ item }: { item: UploadItem }) {
  const navigate = useNavigate()
  const taskId = item.last_task_id

  const [view, setView] = useState<ReadingView>('original')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [zhMarkdown, setZhMarkdown] = useState<string | null>(null)
  const defaultLayout = useMemo(() => loadLayout(), [])
  const [collapsed, setCollapsed] = useState(loadCollapsed)

  const litRef = useRef<PanelImperativeHandle | null>(null)
  const notesRef = useRef<PanelImperativeHandle | null>(null)
  const aiRef = useRef<PanelImperativeHandle | null>(null)
  const restoredRef = useRef(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const goToPageRef = useRef<((page: number) => void) | null>(null)

  const hasMd = Boolean(markdown.trim())
  const hasZh = Boolean(zhMarkdown?.trim())

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

  const openWorkspace = () => {
    navigate('/')
  }

  const openLibrary = () => {
    navigate('/library')
  }

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
    ref.current?.collapse()
    setPaneCollapsed(id, true)
  }

  const expandPane = (id: PaneId) => {
    const ref = id === 'literature' ? litRef : id === 'notes' ? notesRef : aiRef
    ref.current?.expand()
    setPaneCollapsed(id, false)
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
            <h1
              className="font-display min-w-0 truncate text-[22px] leading-tight tracking-wide text-[#1e2a52]"
              title={item.filename}
            >
              {item.filename}
            </h1>
          </div>
        </div>

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
          <span className="relative tracking-wide">返回书架</span>
        </button>
      </header>

      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1"
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
          {collapsed.literature ? (
            <div className="h-full w-full min-w-[44px] overflow-hidden">
              <CollapsedPaneRail label="文献" onExpand={() => expandPane('literature')} />
            </div>
          ) : (
            <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
              <ReadingPaneHeader
                title="文献"
                onCollapse={() => collapsePane('literature')}
                actions={
                  <div className="inline-flex rounded-xl bg-[#eef0fb] p-0.5">
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
                }
              />

              <div className="relative min-h-0 flex-1 overflow-hidden">
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
                  <div ref={scrollRef} className="scrollbar-hidden h-full overflow-y-auto">
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
                )}
              </div>
            </section>
          )}
        </ResizablePanel>

        <ResizableHandle className="w-1.5 bg-[#eceef6] transition-colors duration-150 hover:bg-[#c7c9ef] data-[separator=active]:bg-[#a5a8e0]" />

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
          {collapsed.notes ? (
            <div className="h-full w-full min-w-[44px] overflow-hidden">
              <CollapsedPaneRail label="笔记" onExpand={() => expandPane('notes')} />
            </div>
          ) : (
            <NotesPane
              uploadId={item.upload_id}
              filename={item.filename}
              onCollapse={() => collapsePane('notes')}
            />
          )}
        </ResizablePanel>

        <ResizableHandle className="w-1.5 bg-[#eceef6] transition-colors duration-150 hover:bg-[#c7c9ef] data-[separator=active]:bg-[#a5a8e0]" />

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
          {collapsed.ai ? (
            <div className="h-full w-full min-w-[44px] overflow-hidden">
              <CollapsedPaneRail label="AI 解读" onExpand={() => expandPane('ai')} />
            </div>
          ) : (
            <AiPane
              uploadId={item.upload_id}
              filename={item.filename}
              markdown={markdown}
              zhMarkdown={zhMarkdown}
              onCollapse={() => collapsePane('ai')}
            />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
