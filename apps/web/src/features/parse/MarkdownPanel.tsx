import { useCallback, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import { Check, ChevronDown, Copy, Download, FileText, Languages, Loader2 } from 'lucide-react'
import 'katex/dist/katex.min.css'
import type { LinkSegment } from '@/features/parse/linkSegments'
import { rewriteMarkdownImageSrc } from '@/features/parse/markdownImages'
import { exportTaskPdf } from '@/services/api'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type MdLangView = 'en' | 'zh'

function prepareMarkdown(src: string): string {
  // MinerU often emits HTML tables; keep them intact for rehype-raw.
  // Also normalize escaped dollars so remark-math / KaTeX can pick them up.
  return src.replace(/\\\$/g, '$').replace(/\$\$\s*\n\s*\$\$/g, '$$$$')
}

function MarkdownBody({
  source,
  taskId,
}: {
  source: string
  taskId?: string | null
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        rehypeRaw,
        [rehypeKatex, { throwOnError: false, strict: 'ignore' }],
      ]}
      components={{
        img: ({ src, alt, ...props }) => (
          <img
            {...props}
            src={rewriteMarkdownImageSrc(typeof src === 'string' ? src : undefined, taskId)}
            alt={alt ?? ''}
            loading="lazy"
            className="my-2 max-w-full rounded-lg bg-[#f6f7fc]"
          />
        ),
        table: ({ children, ...props }) => (
          <div className="md-table-wrap">
            <table {...props}>{children}</table>
          </div>
        ),
      }}
    >
      {prepareMarkdown(source)}
    </ReactMarkdown>
  )
}

function ToolBtn({
  label,
  title,
  onClick,
  disabled,
  children,
}: {
  label: string
  title?: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title || label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-[#4f46e5] transition hover:bg-[#eef0fb] disabled:cursor-default disabled:opacity-50"
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

export default function MarkdownPanel({
  markdown,
  zhMarkdown,
  segments,
  taskId,
  filename,
  hoverId,
  onHoverSegment,
  onTranslate,
  translating,
  linkingZh,
  mdView,
  onMdViewChange,
}: {
  markdown: string
  zhMarkdown?: string | null
  segments: LinkSegment[]
  taskId?: string | null
  filename?: string
  hoverId: string | null
  onHoverSegment: (id: string | null) => void
  onTranslate?: () => void | Promise<void>
  translating?: boolean
  /** Backfilling content_list_zh for hover links */
  linkingZh?: boolean
  mdView: MdLangView
  onMdViewChange: (view: MdLangView) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const hasZh = Boolean(zhMarkdown?.trim())
  const showingZh = mdView === 'zh' && hasZh
  const activeMarkdown = showingZh ? zhMarkdown! : markdown
  const empty = useMemo(
    () => !activeMarkdown.trim() && segments.length === 0,
    [activeMarkdown, segments.length],
  )
  const useSegments = segments.length > 0

  const baseName = useMemo(() => {
    const base = (filename || 'document').replace(/\.[^.]+$/, '')
    return base || 'document'
  }, [filename])

  const exportMdName = `${baseName}${showingZh ? '_zh' : ''}.md`
  const exportPdfName = `${baseName}${showingZh ? '_zh' : ''}.pdf`

  const copySource = useCallback(async () => {
    if (!activeMarkdown.trim()) return
    try {
      await navigator.clipboard.writeText(activeMarkdown)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = activeMarkdown
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
  }, [activeMarkdown])

  const exportMd = useCallback(() => {
    if (!activeMarkdown.trim()) return
    const blob = new Blob([activeMarkdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = exportMdName
    a.click()
    URL.revokeObjectURL(url)
  }, [activeMarkdown, exportMdName])

  const exportPdf = useCallback(async () => {
    if (!taskId) {
      setExportMsg('缺少任务 ID，无法导出 PDF')
      return
    }
    if (showingZh && !hasZh) {
      setExportMsg('请先完成翻译再导出译文 PDF')
      return
    }
    setExportingPdf(true)
    setExportMsg(null)
    try {
      await exportTaskPdf(taskId, showingZh ? 'zh' : 'en', exportPdfName)
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : 'PDF 导出失败')
    } finally {
      setExportingPdf(false)
    }
  }, [taskId, showingZh, hasZh, exportPdfName])

  const busy = Boolean(translating || exportingPdf || linkingZh)

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-5 py-3">
        <h2 className="text-[15px] font-bold text-ink">解析结果</h2>
        <div className="flex flex-wrap items-center justify-end gap-0.5">
          <ToolBtn
            label={copied ? '已复制' : '复制'}
            title="复制当前 Markdown 源码"
            onClick={() => void copySource()}
            disabled={empty || busy}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </ToolBtn>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={empty || busy}
                title="导出 Markdown 或 PDF"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-[#4f46e5] transition hover:bg-[#eef0fb] disabled:cursor-default disabled:opacity-50"
              >
                {exportingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                <span>{exportingPdf ? '导出中' : '导出'}</span>
                <ChevronDown size={12} className="opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[10.5rem]">
              <DropdownMenuItem
                className="gap-2 text-[13px]"
                onSelect={() => exportMd()}
                disabled={empty || busy || !activeMarkdown.trim()}
              >
                <FileText size={14} className="text-[#4f46e5]" />
                导出为 Markdown
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 text-[13px]"
                onSelect={() => void exportPdf()}
                disabled={empty || busy || !taskId}
              >
                <Download size={14} className="text-[#e23f2b]" />
                导出为 PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ToolBtn
            label={translating ? '翻译中' : '翻译'}
            title="英译中"
            onClick={() => void onTranslate?.()}
            disabled={!onTranslate || busy || (!markdown.trim() && segments.length === 0)}
          >
            {translating ? <Loader2 size={14} className="animate-spin" /> : <Languages size={14} />}
          </ToolBtn>
        </div>
      </div>

      {exportMsg && (
        <p className="px-5 pb-1 text-right text-[11px] text-[#b45309]">{exportMsg}</p>
      )}

      <div ref={scrollRef} className="scrollbar-hidden relative min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        {translating && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#fafbfe]/88 backdrop-blur-[2px]">
            <div className="relative flex h-14 w-14 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#4f46e5]/20" />
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md">
                <Loader2 size={22} className="animate-spin text-[#4f46e5]" />
              </span>
            </div>
            <p className="text-[14px] font-semibold text-ink">正在翻译中…</p>
            <p className="text-[12px] text-[#9aa0b8]">完成后将自动切换到译文</p>
          </div>
        )}

        {linkingZh && !translating && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#fafbfe]/88 backdrop-blur-[2px]">
            <div className="relative flex h-14 w-14 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#4f46e5]/20" />
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md">
                <Loader2 size={22} className="animate-spin text-[#4f46e5]" />
              </span>
            </div>
            <p className="text-[14px] font-semibold text-ink">正在生成译文联动…</p>
            <p className="text-[12px] text-[#9aa0b8]">完成后可与左栏框选双向悬浮</p>
          </div>
        )}

        {exportingPdf && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#fafbfe]/88 backdrop-blur-[2px]">
            <div className="relative flex h-14 w-14 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#e23f2b]/15" />
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md">
                <Loader2 size={22} className="animate-spin text-[#e23f2b]" />
              </span>
            </div>
            <p className="text-[14px] font-semibold text-ink">正在导出 PDF…</p>
            <p className="text-[12px] text-[#9aa0b8]">使用 direct 导出，请稍候</p>
          </div>
        )}

        {empty && !busy ? (
          <p className="py-10 text-center text-[14px] text-[#9aa0b8]">暂无 Markdown</p>
        ) : useSegments ? (
          <div className="space-y-1 rounded-2xl bg-white p-3 text-[14px] leading-relaxed text-ink">
            {segments.map((seg) => {
              const active = hoverId === seg.id
              return (
                <div
                  key={seg.id}
                  data-seg-id={seg.id}
                  onMouseEnter={() => onHoverSegment(seg.id)}
                  onMouseLeave={() => onHoverSegment(null)}
                  className={`md-seg relative rounded-lg px-2 py-1.5 transition-colors ${
                    active ? 'md-seg-hot' : ''
                  }`}
                  style={
                    {
                      ['--seg-color' as string]: seg.color,
                    } as React.CSSProperties
                  }
                >
                  <article className="md-render">
                    <MarkdownBody source={seg.markdown} taskId={taskId} />
                  </article>
                </div>
              )
            })}
          </div>
        ) : (
          !empty && (
            <article className="md-render rounded-2xl bg-white p-5 text-[14px] leading-relaxed text-ink">
              <MarkdownBody source={activeMarkdown} taskId={taskId} />
            </article>
          )
        )}
      </div>

      {hasZh && (
        <div className="flex shrink-0 items-center justify-center border-t border-[#eceef6] bg-[#fafbfe] px-4 py-2.5">
          <div className="inline-flex rounded-xl bg-[#eef0fb] p-0.5">
            <button
              type="button"
              onClick={() => onMdViewChange('en')}
              disabled={busy}
              className={`rounded-lg px-4 py-1.5 text-[12px] font-semibold transition ${
                mdView === 'en' ? 'bg-white text-[#4f46e5] shadow-sm' : 'text-[#6a70a0]'
              }`}
            >
              原文
            </button>
            <button
              type="button"
              onClick={() => onMdViewChange('zh')}
              disabled={busy}
              className={`rounded-lg px-4 py-1.5 text-[12px] font-semibold transition ${
                mdView === 'zh' ? 'bg-white text-[#4f46e5] shadow-sm' : 'text-[#6a70a0]'
              }`}
            >
              译文
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
