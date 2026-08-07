import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { BookOpen, Wrench } from 'lucide-react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { FilePreview } from '@/features/parse/ParseWorkspace'
import { attachQuoteToAi } from '@/features/reading/aiQuoteBridge'
import { getShortcuts, matchesShortcut } from '@/features/settings/keyboardShortcuts'
import ReadingMarkdown from '@/features/reading/ReadingMarkdown'
import ReadingPaneHeader from '@/features/reading/ReadingPaneHeader'
import { AiPane, NotesPane } from '@/features/reading/ReadingSidePanel'
import { loadParseArtifacts, type UploadItem } from '@/services/api'

export type ReadingView = 'original' | 'md' | 'zh'

const LAYOUT_KEY = 'start:reading-panel-layout'
const DEFAULT_LAYOUT = { literature: 34, notes: 33, ai: 33 }

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
      return parsed
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_LAYOUT }
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
      // Only from rendered markdown body (not chrome / empty states)
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
          onClick={openWorkspace}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/70 bg-white/80 px-3 py-1.5 text-[12px] font-semibold text-[#6a70a0] shadow-sm backdrop-blur transition hover:border-[#c7c9ef] hover:text-[#4f46e5]"
        >
          <Wrench size={13} />
          工作区
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
        <ResizablePanel id="literature" minSize="18" className="min-w-0">
          <section className="relative flex h-full min-h-0 min-w-0 flex-col">
            <ReadingPaneHeader
              title="文献"
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

            <div className="relative min-h-0 flex-1">
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
        </ResizablePanel>

        <ResizableHandle className="w-1.5 bg-[#eceef6] transition-colors duration-150 hover:bg-[#c7c9ef] data-[separator=active]:bg-[#a5a8e0]" />

        <ResizablePanel id="notes" minSize="15" className="min-w-0">
          <NotesPane uploadId={item.upload_id} filename={item.filename} />
        </ResizablePanel>

        <ResizableHandle className="w-1.5 bg-[#eceef6] transition-colors duration-150 hover:bg-[#c7c9ef] data-[separator=active]:bg-[#a5a8e0]" />

        <ResizablePanel id="ai" minSize="15" className="min-w-0">
          <AiPane
            uploadId={item.upload_id}
            filename={item.filename}
            markdown={markdown}
            zhMarkdown={zhMarkdown}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
