import { useEffect, useState } from 'react'
import { BookOpen, Copy, Download, Loader2, Quote, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  copyCitationText,
  downloadCitationFile,
  formatCitation,
  type CiteFields,
  type CiteFormat,
} from '@/features/library/citations'
import {
  getPaperLibrary,
  identifyPaper,
  patchPaperLibrary,
  type PaperLibrary,
  type UploadItem,
  paperDisplayTitle,
} from '@/services/api'

const fieldCls =
  'h-10 w-full rounded-xl border border-[#e4e6f0] bg-[#fbfbfe] px-3 text-[14px] text-ink outline-none transition placeholder:text-[#b0b5c9] hover:border-[#d8daf0] focus:border-[#c7c9ef] focus:bg-white focus:ring-2 focus:ring-[#eef0fb]'

const labelCls = 'mb-1.5 block text-[12px] font-semibold tracking-wide text-[#6a70a0]'

function applyLibToForm(
  lib: Partial<PaperLibrary>,
  item: UploadItem,
  setters: {
    setTitle: (v: string) => void
    setAuthors: (v: string) => void
    setYear: (v: string) => void
    setDoi: (v: string) => void
    setAbstract: (v: string) => void
    setVenue: (v: string) => void
    setVenueType: (v: string) => void
    setFolder: (v: string) => void
    setTags: (v: string) => void
    setSource: (v: string) => void
    setArxivId: (v: string) => void
  },
) {
  setters.setTitle(lib.title || paperDisplayTitle(item))
  setters.setAuthors((lib.authors || []).join('; '))
  setters.setYear(lib.year != null ? String(lib.year) : '')
  setters.setDoi(lib.doi || '')
  setters.setAbstract(lib.abstract || '')
  setters.setVenue(lib.venue || '')
  setters.setVenueType(lib.venue_type || '')
  setters.setFolder(lib.folder || '')
  setters.setTags((lib.tags || []).join(', '))
  setters.setSource(lib.metadata_source || '')
  setters.setArxivId(lib.arxiv_id || item.arxiv_id || '')
}

function sourceLabel(source: string): string {
  if (source === 'crossref' || source === 'crossref-title') return 'Crossref'
  if (source === 'arxiv') return 'arXiv'
  if (source === 'manual') return '手动'
  return source
}

export default function PaperMetaDialog({
  item,
  open,
  onOpenChange,
  onSaved,
}: {
  item: UploadItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [identifying, setIdentifying] = useState(false)
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [year, setYear] = useState('')
  const [doi, setDoi] = useState('')
  const [abstract, setAbstract] = useState('')
  const [venue, setVenue] = useState('')
  const [venueType, setVenueType] = useState('')
  const [folder, setFolder] = useState('')
  const [tags, setTags] = useState('')
  const [source, setSource] = useState('')
  const [arxivId, setArxivId] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const setters = {
    setTitle,
    setAuthors,
    setYear,
    setDoi,
    setAbstract,
    setVenue,
    setVenueType,
    setFolder,
    setTags,
    setSource,
    setArxivId,
  }

  useEffect(() => {
    if (!open || !item) return
    let cancelled = false
    setLoading(true)
    setErr(null)
    setMsg(null)
    void (async () => {
      try {
        const lib: PaperLibrary = await getPaperLibrary(item.upload_id)
        if (cancelled) return
        applyLibToForm(lib, item, setters)
      } catch (e) {
        if (!cancelled) {
          applyLibToForm(item, item, setters)
          setErr(e instanceof Error ? e.message : '加载失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when dialog opens for item
  }, [open, item])

  const onIdentify = async (force: boolean) => {
    if (!item) return
    setIdentifying(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await identifyPaper(item.upload_id, { force })
      if (res.paper) applyLibToForm(res.paper, item, setters)
      if (res.skipped) setMsg(res.detail || '已识别过')
      else if (res.ok) {
        const byMap: Record<string, string> = {
          ai: 'AI',
          'ai+doi': 'AI + DOI',
          'ai+arxiv': 'AI + arXiv',
          'ai+crossref': 'AI + Crossref',
          title: '标题',
          doi: 'DOI',
          arxiv: 'arXiv',
        }
        const by = (res.matched_by && byMap[res.matched_by]) || res.matched_by || 'ok'
        setMsg(`已识别（依据${by}）`)
      }
      else setErr(res.detail || '未能识别')
      onSaved?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '识别失败')
    } finally {
      setIdentifying(false)
    }
  }

  const onSave = async () => {
    if (!item) return
    setSaving(true)
    setErr(null)
    try {
      const yearNum = year.trim() ? Number(year.trim()) : null
      await patchPaperLibrary(item.upload_id, {
        title: title.trim() || null,
        authors: authors
          .split(/[;；,，]/)
          .map((a) => a.trim())
          .filter(Boolean),
        year: yearNum != null && Number.isFinite(yearNum) ? yearNum : null,
        doi: doi.trim() || null,
        abstract: abstract.trim() || null,
        venue: venue.trim() || null,
        venue_type: venueType.trim() || null,
        folder: folder.trim() || null,
        tags: tags
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean),
      })
      onSaved?.()
      onOpenChange(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const currentCiteFields = (): CiteFields => {
    const yearNum = year.trim() ? Number(year.trim()) : null
    return {
      upload_id: item?.upload_id,
      filename: item?.filename,
      title: title.trim() || null,
      authors: authors
        .split(/[;；,，]/)
        .map((a) => a.trim())
        .filter(Boolean),
      year: yearNum != null && Number.isFinite(yearNum) ? yearNum : null,
      doi: doi.trim() || null,
      abstract: abstract.trim() || null,
      venue: venue.trim() || null,
      venue_type: venueType.trim() || null,
      arxiv_id: arxivId.trim() || null,
    }
  }

  const onCiteCopy = async (format: CiteFormat) => {
    const text = formatCitation(currentCiteFields(), format)
    const ok = await copyCitationText(text)
    setMsg(ok ? `已复制 ${format === 'ris' ? 'RIS' : 'BibTeX'}` : '复制失败')
    setErr(ok ? null : '无法写入剪贴板')
  }

  const onCiteDownload = (format: CiteFormat) => {
    const fields = currentCiteFields()
    const text = formatCitation(fields, format)
    const base =
      (fields.title || fields.filename || 'citation')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .slice(0, 48) || 'citation'
    downloadCitationFile(text, format, base)
    setMsg(`已下载 ${format === 'ris' ? '.ris' : '.bib'}`)
  }

  const venueTypeLabel =
    venueType === 'journal'
      ? '期刊'
      : venueType === 'conference'
        ? '会议'
        : venueType === 'preprint'
          ? '预印本'
          : venueType || ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[min(92vh,720px)] w-full flex-col gap-0 overflow-hidden rounded-2xl border-[#e4e6f0] bg-[#f8f8fd] p-0 shadow-[0_24px_64px_-28px_rgba(30,42,82,0.45)] sm:max-w-xl"
      >
        <DialogHeader className="relative shrink-0 overflow-hidden border-b border-[#e8e9f4] px-6 pb-4 pt-5 text-left">
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#e9ebfb] via-[#f3f4fb] to-transparent"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full opacity-40 blur-3xl"
            style={{ background: 'radial-gradient(circle, #c5c8f0 0%, transparent 70%)' }}
            aria-hidden
          />
          <div className="relative flex items-start gap-3 pr-8">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#4f46e5] shadow-sm ring-1 ring-[#e4e6f4]">
              <BookOpen size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-[17px] font-bold tracking-wide text-ink">
                  文献信息
                </DialogTitle>
                {source ? (
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-[#6a70a0] ring-1 ring-[#e4e6f0]">
                    {sourceLabel(source)}
                  </span>
                ) : null}
                {venueTypeLabel ? (
                  <span className="rounded-full bg-[#eef0fb] px-2 py-0.5 text-[11px] font-semibold text-[#4f46e5]">
                    {venueTypeLabel}
                  </span>
                ) : null}
              </div>
              <DialogDescription className="mt-1 truncate text-[12px] text-[#9aa0b8]">
                {item?.filename || '—'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4 [scrollbar-width:thin] [scrollbar-color:#c9cce4_transparent]">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-[#9aa0b8]">
              <Loader2 size={16} className="animate-spin text-[#4f46e5]" />
              加载中…
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl border border-[#e8e9f4] bg-white p-4 shadow-sm">
              <label className="block">
                <span className={labelCls}>标题</span>
                <input className={fieldCls} value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="block">
                <span className={labelCls}>作者（分号分隔）</span>
                <input
                  className={fieldCls}
                  value={authors}
                  onChange={(e) => setAuthors(e.target.value)}
                  placeholder="Zhang; Li"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={labelCls}>年份</span>
                  <input
                    className={fieldCls}
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="2024"
                  />
                </label>
                <label className="block">
                  <span className={labelCls}>DOI</span>
                  <input className={fieldCls} value={doi} onChange={(e) => setDoi(e.target.value)} />
                </label>
              </div>
              <label className="block">
                <span className={labelCls}>
                  期刊 / 会议{venueTypeLabel ? `（${venueTypeLabel}）` : ''}
                </span>
                <input
                  className={fieldCls}
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="例如：NeurIPS / Nature"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={labelCls}>文件夹</span>
                  <input
                    className={fieldCls}
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                    placeholder="CV / NLP"
                  />
                </label>
                <label className="block">
                  <span className={labelCls}>标签</span>
                  <input
                    className={fieldCls}
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="survey, transformer"
                  />
                </label>
              </div>
              <label className="block">
                <span className={labelCls}>摘要</span>
                <textarea
                  value={abstract}
                  onChange={(e) => setAbstract(e.target.value)}
                  rows={5}
                  className="min-h-[120px] w-full resize-y rounded-xl border border-[#e4e6f0] bg-[#fbfbfe] px-3 py-2.5 text-[14px] leading-relaxed text-ink outline-none transition placeholder:text-[#b0b5c9] hover:border-[#d8daf0] focus:border-[#c7c9ef] focus:bg-white focus:ring-2 focus:ring-[#eef0fb]"
                />
              </label>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-[#e8e9f4] bg-white/90 px-6 py-3.5 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saving || loading || !item}
              onClick={() => void onSave()}
              className="inline-flex h-9 items-center rounded-xl bg-[#4f46e5] px-4 text-[13px] font-bold text-white transition hover:opacity-95 disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
            <button
              type="button"
              disabled={identifying || loading || !item}
              onClick={() => void onIdentify(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#dfe1f4] bg-[#eef0fb] px-3 text-[12px] font-semibold text-[#4f46e5] transition hover:bg-[#e4e6fb] disabled:opacity-50"
            >
              {identifying ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Sparkles size={13} />
              )}
              {identifying ? '识别中…' : '自动识别'}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={loading || !item}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#e4e6f0] bg-white px-3 text-[12px] font-semibold text-[#6a70a0] transition hover:border-[#c7c9ef] hover:text-[#4f46e5] disabled:opacity-50"
                >
                  <Quote size={13} />
                  引用
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem onClick={() => void onCiteCopy('bibtex')}>
                  <Copy size={13} />
                  复制 BibTeX
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void onCiteCopy('ris')}>
                  <Copy size={13} />
                  复制 RIS
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onCiteDownload('bibtex')}>
                  <Download size={13} />
                  下载 .bib
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onCiteDownload('ris')}>
                  <Download size={13} />
                  下载 .ris
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 items-center rounded-xl border border-[#e4e6f0] bg-white px-3 text-[12px] font-semibold text-[#6a70a0] transition hover:bg-[#f8f8fd]"
            >
              取消
            </button>
            {msg ? (
              <span className="ml-auto text-[12px] font-medium text-[#059669]">{msg}</span>
            ) : null}
            {err ? (
              <span className={`text-[12px] font-medium text-[#dc2626] ${msg ? '' : 'ml-auto'}`}>
                {err}
              </span>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
