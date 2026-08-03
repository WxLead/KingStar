import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  FileText,
  ScanSearch,
  Upload,
  Cpu,
  Cloud,
  Layers,
  ChevronLeft,
  ChevronRight,
  Columns2,
  ArrowLeft,
  Loader2,
} from 'lucide-react'
import { useUploads } from '@/features/uploads/UploadsContext'
import {
  formatBytes,
  getTask,
  loadParseArtifacts,
  ensureLinkZh,
  fetchArtifactJson,
  pollTask,
  type UploadItem,
} from '@/services/api'
import { getCachedUploadBlob } from '@/features/parse/previewCache'
import ParseConfigPanel, {
  modeToBackend,
  PARSE_MODE_OPTIONS,
  type ParseConfigValue,
} from '@/features/parse/ParseConfigPanel'
import MarkdownPanel from '@/features/parse/MarkdownPanel'
import {
  buildLinkedLayout,
  buildZhLinkedSegments,
  type ContentListItem,
} from '@/features/parse/linkSegments'
import {
  bboxToPercent,
  colorForType,
  getPageSize,
  type LayoutBox,
  type MiddleJson,
} from '@/features/parse/middleTypes'

function extOf(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function PreviewToolbar({
  currentPage,
  pageCount,
  onPrev,
  onNext,
  onBack,
  title = '原文件',
  boxCount,
}: {
  currentPage: number
  pageCount: number
  onPrev: () => void
  onNext: () => void
  onBack: () => void
  title?: string
  boxCount?: number
}) {
  const atStart = currentPage <= 1
  const atEnd = pageCount > 0 ? currentPage >= pageCount : true

  return (
    <header className="relative grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3 justify-self-start">
        <span className="shrink-0 text-[15px] font-semibold text-ink">{title}</span>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-[#4f46e5] transition hover:bg-[#f3f4fb]"
          title="继续上传"
        >
          <Upload size={14} />
          上传
        </button>
        {typeof boxCount === 'number' && boxCount > 0 && (
          <span className="rounded-md bg-[#eef0fb] px-2 py-0.5 text-[11px] font-semibold text-[#4f46e5]">
            {boxCount} 个框
          </span>
        )}
      </div>

      <div className="justify-self-center">
        {pageCount > 0 ? (
          <div className="flex items-center gap-1.5 text-[14px] text-ink">
            <button
              type="button"
              disabled={atStart}
              onClick={onPrev}
              className="rounded-md p-1 text-ink transition hover:bg-[#f3f4fb] disabled:cursor-default disabled:text-[#c5c9dc]"
              aria-label="上一页"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-[4.5rem] text-center tabular-nums">
              {currentPage} / {pageCount}
            </span>
            <button
              type="button"
              disabled={atEnd}
              onClick={onNext}
              className="rounded-md p-1 text-ink transition hover:bg-[#f3f4fb] disabled:cursor-default disabled:text-[#c5c9dc]"
              aria-label="下一页"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        ) : null}
      </div>

      <div className="justify-self-end">
        <span className="inline-flex text-[#c5c9dc]" title="预览布局">
          <Columns2 size={17} />
        </span>
      </div>
    </header>
  )
}

function paintOverlays(
  pageEls: HTMLElement[],
  boxes: LayoutBox[],
  middle: MiddleJson | null,
  onHover: (id: string | null) => void,
) {
  for (const wrap of pageEls) {
    const pageNum = Number(wrap.dataset.page || 1)
    const pageIndex = pageNum - 1
    const layer = wrap.querySelector<HTMLElement>('[data-overlay-layer]')
    if (!layer) continue

    layer.innerHTML = ''
    const pageSize = getPageSize(middle, pageIndex)
    if (!pageSize) continue

    const pageBoxes = boxes.filter((b) => b.pageIndex === pageIndex)
    for (const box of pageBoxes) {
      const pct = bboxToPercent(box.bbox, pageSize)
      const color = colorForType(box.type)

      const el = document.createElement('button')
      el.type = 'button'
      el.dataset.boxId = box.id
      el.dataset.boxColor = color
      if (box.segmentId) el.dataset.segmentId = box.segmentId
      else delete el.dataset.segmentId
      el.className = 'absolute box-border transition-[box-shadow,background-color] duration-150'
      el.style.setProperty('--box-color', color)
      el.style.left = pct.left
      el.style.top = pct.top
      el.style.width = pct.width
      el.style.height = pct.height
      el.style.border = `1.5px solid ${color}`
      el.style.background = `${color}14`
      el.style.boxShadow = 'none'
      el.style.cursor = 'pointer'
      el.style.overflow = 'visible'
      el.style.zIndex = '1'

      const label = document.createElement('span')
      label.dataset.boxLabel = '1'
      label.textContent = box.type
      label.className =
        'pointer-events-none absolute left-0 top-0 z-10 max-w-full truncate rounded-br px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm'
      label.style.backgroundColor = color
      label.style.opacity = '0'
      label.style.transition = 'opacity 120ms ease'

      el.addEventListener('mouseenter', () => onHover(box.id))
      el.addEventListener('mouseleave', () => onHover(null))

      el.appendChild(label)
      layer.appendChild(el)
    }
  }
}

function updateOverlayHighlight(
  pageEls: HTMLElement[],
  hoverBoxId: string | null,
  hoverSegId: string | null,
) {
  for (const wrap of pageEls) {
    const layer = wrap.querySelector<HTMLElement>('[data-overlay-layer]')
    if (!layer) continue
    for (const node of Array.from(layer.children)) {
      const el = node as HTMLElement
      const id = el.dataset.boxId
      if (!id) continue
      const color = el.dataset.boxColor || '#4f46e5'
      const seg = el.dataset.segmentId || ''
      const isHot =
        hoverBoxId === id || (!!hoverSegId && !!seg && hoverSegId === seg)
      const label = el.querySelector<HTMLElement>('[data-box-label]')
      el.style.background = isHot ? `${color}33` : `${color}14`
      el.style.boxShadow = isHot ? `0 0 0 2px ${color}` : 'none'
      el.style.zIndex = isHot ? '6' : '1'
      if (label) label.style.opacity = isHot ? '1' : '0'
    }
  }
}

/** High-DPI pdf.js pages with scroll-synced current page + optional middle.json boxes. */
function PdfPages({
  blob,
  zoom,
  scrollParentRef,
  onPageCount,
  onCurrentPage,
  goToPageRef,
  layoutBoxes,
  middle,
  hoverBoxId,
  hoverSegId,
  onHoverBox,
}: {
  blob: Blob
  zoom: number
  scrollParentRef: React.RefObject<HTMLDivElement | null>
  onPageCount?: (n: number) => void
  onCurrentPage?: (n: number) => void
  goToPageRef: React.MutableRefObject<((page: number) => void) | null>
  layoutBoxes?: LayoutBox[]
  middle?: MiddleJson | null
  hoverBoxId?: string | null
  hoverSegId?: string | null
  onHoverBox?: (id: string | null) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const pageElsRef = useRef<HTMLElement[]>([])
  const hoverRef = useRef(onHoverBox)
  hoverRef.current = onHoverBox
  const layoutBoxesRef = useRef(layoutBoxes)
  layoutBoxesRef.current = layoutBoxes
  const middleRef = useRef(middle ?? null)
  middleRef.current = middle ?? null

  useEffect(() => {
    let cancelled = false
    let pdfDoc: { destroy: () => Promise<void> } | null = null

    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()

        const data = await blob.arrayBuffer()
        if (cancelled) return
        const doc = await pdfjs.getDocument({
          data,
          disableFontFace: false,
          useSystemFonts: true,
        }).promise
        pdfDoc = doc
        if (cancelled || !hostRef.current) return
        onPageCount?.(doc.numPages)
        onCurrentPage?.(1)
        hostRef.current.innerHTML = ''
        pageElsRef.current = []

        const cssWidth = Math.min(hostRef.current.clientWidth || 640, 860)
        // Screen preview scale — far cheaper than previous print-intent 3–4× DPR
        const dpr = window.devicePixelRatio || 1
        const outputScale = Math.min(Math.max(dpr, 1.25), 2)

        const renderPage = async (i: number) => {
          if (cancelled || !hostRef.current) return
          const page = await doc.getPage(i)
          const base = page.getViewport({ scale: 1 })
          const cssScale = cssWidth / base.width
          const cssW = Math.floor(base.width * cssScale)
          const cssH = Math.floor(base.height * cssScale)

          const maxEdge = 4096
          let scale = cssScale * outputScale
          let viewport = page.getViewport({ scale })
          if (viewport.width > maxEdge || viewport.height > maxEdge) {
            scale *= maxEdge / Math.max(viewport.width, viewport.height)
            viewport = page.getViewport({ scale })
          }

          const wrap = document.createElement('div')
          wrap.dataset.page = String(i)
          wrap.className = 'mb-6 flex w-full justify-center'
          wrap.style.scrollMarginTop = '12px'

          const frame = document.createElement('div')
          frame.dataset.pageFrame = '1'
          frame.className = 'relative inline-block max-w-full'
          frame.style.width = `${cssW}px`

          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.width = `${cssW}px`
          canvas.style.height = `${cssH}px`
          canvas.className = 'block max-w-full bg-white'
          canvas.style.imageRendering = 'auto'

          const overlay = document.createElement('div')
          overlay.dataset.overlayLayer = '1'
          overlay.className = 'pointer-events-none absolute inset-0'
          overlay.style.width = `${cssW}px`
          overlay.style.height = `${cssH}px`
          overlay.style.pointerEvents = 'none'

          const ctx = canvas.getContext('2d', {
            alpha: false,
            desynchronized: true,
          })
          if (!ctx) return
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'medium'

          await page.render({
            canvasContext: ctx,
            viewport,
            intent: 'display',
            background: 'rgb(255,255,255)',
          }).promise
          if (cancelled) return

          frame.appendChild(canvas)
          frame.appendChild(overlay)
          wrap.appendChild(frame)
          hostRef.current?.appendChild(wrap)
          pageElsRef.current.push(wrap)
        }

        const syncOverlays = () => {
          const boxes = layoutBoxesRef.current ?? []
          paintOverlays(pageElsRef.current, boxes, middleRef.current, (id) => hoverRef.current?.(id))
          for (const wrap of pageElsRef.current) {
            const layer = wrap.querySelector<HTMLElement>('[data-overlay-layer]')
            if (!layer) continue
            layer.style.pointerEvents = boxes.length ? 'auto' : 'none'
            for (const child of Array.from(layer.children)) {
              ;(child as HTMLElement).style.pointerEvents = 'auto'
            }
          }
        }

        // First page ASAP, then the rest — avoids long full-doc lock
        await renderPage(1)
        if (!cancelled) {
          setLoading(false)
          syncOverlays()
        }

        for (let i = 2; i <= doc.numPages; i++) {
          if (cancelled) break
          await renderPage(i)
          if (!cancelled) syncOverlays()
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'PDF 预览失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      void pdfDoc?.destroy().catch(() => undefined)
      if (hostRef.current) hostRef.current.innerHTML = ''
      pageElsRef.current = []
    }
  }, [blob, onPageCount, onCurrentPage])

  // Paint / refresh layout boxes after pages exist / boxes change
  useEffect(() => {
    if (loading) return
    const boxes = layoutBoxes ?? []
    paintOverlays(pageElsRef.current, boxes, middle ?? null, (id) => hoverRef.current?.(id))
    for (const wrap of pageElsRef.current) {
      const layer = wrap.querySelector<HTMLElement>('[data-overlay-layer]')
      if (!layer) continue
      layer.style.pointerEvents = boxes.length ? 'auto' : 'none'
      for (const child of Array.from(layer.children)) {
        ;(child as HTMLElement).style.pointerEvents = 'auto'
      }
    }
  }, [loading, layoutBoxes, middle])

  // Hover highlight without rebuilding boxes
  useEffect(() => {
    if (loading) return
    updateOverlayHighlight(pageElsRef.current, hoverBoxId ?? null, hoverSegId ?? null)
  }, [loading, hoverBoxId, hoverSegId, layoutBoxes])

  // Scroll → update current page
  useEffect(() => {
    const root = scrollParentRef.current
    if (!root || loading) return

    const update = () => {
      const pages = pageElsRef.current
      if (!pages.length) return
      const rootRect = root.getBoundingClientRect()
      const anchor = rootRect.top + rootRect.height * 0.28
      let best = 1
      let bestDist = Number.POSITIVE_INFINITY
      for (const el of pages) {
        const r = el.getBoundingClientRect()
        const mid = (r.top + r.bottom) / 2
        const dist = Math.abs(mid - anchor)
        const page = Number(el.dataset.page || 1)
        if (dist < bestDist) {
          bestDist = dist
          best = page
        }
      }
      onCurrentPage?.(best)
    }

    update()
    root.addEventListener('scroll', update, { passive: true })
    return () => root.removeEventListener('scroll', update)
  }, [loading, scrollParentRef, onCurrentPage])

  // Expose goToPage
  useEffect(() => {
    goToPageRef.current = (page: number) => {
      const el = pageElsRef.current.find((n) => Number(n.dataset.page) === page)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      onCurrentPage?.(page)
    }
    return () => {
      goToPageRef.current = null
    }
  }, [goToPageRef, onCurrentPage, loading])

  return (
    <div className="px-5 py-4">
      {loading && <p className="text-[15px] text-[#9aa0b8]">渲染预览…</p>}
      {error && <p className="text-[15px] text-ink-soft">{error}</p>}
      <div
        ref={hostRef}
        className="mx-auto w-full max-w-[860px] origin-top"
        style={{ zoom: zoom / 100 }}
      />
    </div>
  )
}

function FilePreview({
  item,
  zoom,
  scrollParentRef,
  onPageCount,
  onCurrentPage,
  goToPageRef,
  layoutBoxes,
  middle,
  hoverBoxId,
  hoverSegId,
  onHoverBox,
}: {
  item: UploadItem
  zoom: number
  scrollParentRef: React.RefObject<HTMLDivElement | null>
  onPageCount?: (n: number | null) => void
  onCurrentPage?: (n: number) => void
  goToPageRef: React.MutableRefObject<((page: number) => void) | null>
  layoutBoxes?: LayoutBox[]
  middle?: MiddleJson | null
  hoverBoxId?: string | null
  hoverSegId?: string | null
  onHoverBox?: (id: string | null) => void
}) {
  const [text, setText] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const ext = extOf(item.filename)

  useEffect(() => {
    let revoked: string | null = null
    let cancelled = false
    onPageCount?.(null)

    ;(async () => {
      setLoading(true)
      setError(null)
      setText(null)
      setBlob(null)
      setObjectUrl(null)
      try {
        const fileBlob = await getCachedUploadBlob(item.upload_id)
        if (cancelled) return
        if (['md', 'txt', 'markdown'].includes(ext)) {
          setText(await fileBlob.text())
          onPageCount?.(null)
        } else if (ext === 'pdf') {
          setBlob(fileBlob)
        } else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
          const url = URL.createObjectURL(fileBlob)
          revoked = url
          setObjectUrl(url)
          onPageCount?.(1)
          onCurrentPage?.(1)
        } else {
          setError('该格式暂不支持在线预览，可直接进行版面分析')
          onPageCount?.(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '预览加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [item.upload_id, item.filename, ext, onPageCount, onCurrentPage])

  if (loading) {
    return <p className="px-6 py-8 text-[15px] text-[#9aa0b8]">加载预览…</p>
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <FileText size={36} className="text-[#c5c9dc]" />
        <p className="text-[15px] text-ink-soft">{error}</p>
        <p className="text-[13px] text-[#9aa0b8]">{item.filename}</p>
      </div>
    )
  }
  if (text !== null) {
    return (
      <article className="px-7 py-6">
        <pre className="whitespace-pre-wrap break-words font-sans text-[15px] leading-[1.75] text-ink">
          {text}
        </pre>
      </article>
    )
  }
  if (blob && ext === 'pdf') {
    return (
      <PdfPages
        blob={blob}
        zoom={zoom}
        scrollParentRef={scrollParentRef}
        onPageCount={onPageCount}
        onCurrentPage={onCurrentPage}
        goToPageRef={goToPageRef}
        layoutBoxes={layoutBoxes}
        middle={middle}
        hoverBoxId={hoverBoxId}
        hoverSegId={hoverSegId}
        onHoverBox={onHoverBox}
      />
    )
  }
  if (objectUrl) {
    return (
      <div className="flex justify-center px-6 py-6">
        <img
          src={objectUrl}
          alt={item.filename}
          className="max-w-full origin-top bg-white transition-transform duration-150"
          style={{ transform: `scale(${zoom / 100})` }}
        />
      </div>
    )
  }
  return null
}

function modeIcon(mode: ParseConfigValue['mode']) {
  if (mode === 'pipeline') return <Layers size={18} className="text-[#4f46e5]" />
  if (mode === 'remote') return <Cloud size={18} className="text-[#4f46e5]" />
  return <Cpu size={18} className="text-[#4f46e5]" />
}

type Phase = 'config' | 'running' | 'result'

export default function ParseWorkspace({ item }: { item: UploadItem }) {
  const { busyId, parseLayout, translateOneClick, setSelectedId } = useUploads()
  const [msg, setMsg] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const goToPageRef = useRef<((page: number) => void) | null>(null)
  const [config, setConfig] = useState<ParseConfigValue>({
    mode: 'pipeline',
  })
  const [phase, setPhase] = useState<Phase>('config')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [zhMarkdown, setZhMarkdown] = useState<string | null>(null)
  const [mdView, setMdView] = useState<'en' | 'zh'>('en')
  const [middle, setMiddle] = useState<MiddleJson | null>(null)
  const [contentList, setContentList] = useState<ContentListItem[] | null>(null)
  const [contentListZh, setContentListZh] = useState<ContentListItem[] | null>(null)
  const [hoverBoxId, setHoverBoxId] = useState<string | null>(null)
  const [hoverSegId, setHoverSegId] = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)
  const [linkingZh, setLinkingZh] = useState(false)
  /** Avoid re-fetching the same bound task after runParse / restore. */
  const boundShownRef = useRef<string | null>(null)
  const busy = busyId === item.upload_id || phase === 'running'
  const currentOpt = PARSE_MODE_OPTIONS.find((o) => o.mode === config.mode) ?? PARSE_MODE_OPTIONS[1]
  const remoteServerUrl =
    (import.meta.env.VITE_MINERU_SERVER_URL as string | undefined)?.trim() ||
    'http://127.0.0.1:30000'

  const { segments: enSegments, boxes: layoutBoxes } = useMemo(
    () => buildLinkedLayout(contentList, middle),
    [contentList, middle],
  )

  const zhSegments = useMemo(
    () => buildZhLinkedSegments(contentListZh, middle, enSegments),
    [contentListZh, middle, enSegments],
  )

  const activeSegments = mdView === 'zh' ? zhSegments : enSegments

  const boxById = useMemo(() => {
    const m = new Map<string, LayoutBox>()
    for (const b of layoutBoxes) m.set(b.id, b)
    return m
  }, [layoutBoxes])

  const handlePageCount = useCallback((n: number | null) => {
    setPageCount(n ?? 0)
    if (!n) setCurrentPage(1)
  }, [])

  const clearHover = useCallback(() => {
    setHoverBoxId(null)
    setHoverSegId(null)
  }, [])

  const onHoverBox = useCallback(
    (id: string | null) => {
      if (!id) {
        clearHover()
        return
      }
      setHoverBoxId(id)
      setHoverSegId(boxById.get(id)?.segmentId ?? null)
    },
    [boxById, clearHover],
  )

  const onHoverSegment = useCallback(
    (id: string | null) => {
      if (!id) {
        clearHover()
        return
      }
      setHoverSegId(id)
      setHoverBoxId(null)
    },
    [clearHover],
  )

  const applyArtifacts = useCallback(async (id: string) => {
    const {
      markdown: md,
      middle: mid,
      contentList: cl,
      contentListZh: clZh,
      zhMarkdown: zh,
    } = await loadParseArtifacts(id)
    setMarkdown(md)
    setMiddle((mid as MiddleJson | null) ?? null)
    setContentList(Array.isArray(cl) ? (cl as ContentListItem[]) : null)
    setContentListZh(Array.isArray(clZh) ? (clZh as ContentListItem[]) : null)
    const hasZh = Boolean(zh?.trim())
    setZhMarkdown(hasZh ? zh : null)
    setMdView(hasZh ? 'zh' : 'en')
    setHoverBoxId(null)
    setHoverSegId(null)
    setTaskId(id)
    setPhase('result')
    setMsg(null)
    boundShownRef.current = id

    // Old translated tasks may lack content_list_zh — backfill for hover linking
    if (hasZh && !Array.isArray(clZh)) {
      setLinkingZh(true)
      setMsg('正在生成译文联动段落…')
      try {
        await ensureLinkZh(id)
        const fresh = await fetchArtifactJson(id, 'content_list_zh')
        setContentListZh(Array.isArray(fresh) ? (fresh as ContentListItem[]) : null)
        setMsg(null)
      } catch (e) {
        setMsg(e instanceof Error ? e.message : '译文联动生成失败，仍可阅读全文')
      } finally {
        setLinkingZh(false)
      }
    }
  }, [])

  const handleMdViewChange = useCallback(
    async (view: 'en' | 'zh') => {
      setMdView(view)
      clearHover()
      if (view !== 'zh' || !taskId || !zhMarkdown?.trim() || contentListZh) return

      setLinkingZh(true)
      setMsg('正在生成译文联动段落…')
      try {
        await ensureLinkZh(taskId)
        const clZh = await fetchArtifactJson(taskId, 'content_list_zh')
        setContentListZh(Array.isArray(clZh) ? (clZh as ContentListItem[]) : null)
        setMsg(null)
      } catch (e) {
        setMsg(e instanceof Error ? e.message : '译文联动生成失败，仍可阅读全文')
      } finally {
        setLinkingZh(false)
      }
    },
    [taskId, zhMarkdown, contentListZh, clearHover],
  )

  // Restore persisted parse result bound to this upload (last_task_id → artifacts)
  useEffect(() => {
    let cancelled = false
    const tid = item.last_task_id

    setHoverBoxId(null)
    setHoverSegId(null)

    if (!tid) {
      boundShownRef.current = null
      setPhase('config')
      setTaskId(null)
      setMarkdown('')
      setMiddle(null)
      setContentList(null)
      setContentListZh(null)
      setZhMarkdown(null)
      setMdView('en')
      setMsg(null)
      return
    }

    // Same task already on screen (just finished analyze, or user left result via 重新配置)
    if (boundShownRef.current === tid) return

    ;(async () => {
      try {
        setTaskId(tid)
        let task = await getTask(tid)
        if (cancelled) return

        if (task.status === 'queued' || task.status === 'parsing' || task.status === 'translating') {
          setPhase('running')
          setMsg(`恢复进行中的任务 ${tid.slice(0, 8)}…`)
          task = await pollTask(tid, { intervalMs: 1500 })
          if (cancelled) return
        }

        const stage = item.pipeline_stage
        const canShowResult =
          task.status === 'done' ||
          stage === 'parsed' ||
          stage === 'completed' ||
          Boolean(item.has_zh)

        if (canShowResult) {
          setPhase('running')
          setMsg(
            stage === 'completed' || item.has_zh
              ? '加载已完成结果…'
              : '加载已有版面分析结果…',
          )
          try {
            await applyArtifacts(tid)
            return
          } catch {
            // fall through to config if artifacts missing
          }
        }

        boundShownRef.current = null
        setPhase('config')
        setMarkdown('')
        setMiddle(null)
        setContentList(null)
        setMsg(task.error || '上次版面分析未成功，可重新开始')
      } catch (e) {
        if (cancelled) return
        boundShownRef.current = null
        setPhase('config')
        setMarkdown('')
        setMiddle(null)
        setContentList(null)
        setMsg(e instanceof Error ? e.message : '无法加载历史解析结果')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [item.upload_id, item.last_task_id, item.pipeline_stage, item.has_zh, applyArtifacts])

  const runParse = async () => {
    setMsg(null)
    setPhase('running')
    setMarkdown('')
    setMiddle(null)
    setContentList(null)
    setContentListZh(null)
    setZhMarkdown(null)
    setMdView('en')
    setHoverBoxId(null)
    setHoverSegId(null)
    boundShownRef.current = null
    try {
      const id = await parseLayout(item.upload_id, {
        parse_backend: modeToBackend(config.mode),
        server_url: config.mode === 'remote' ? remoteServerUrl : null,
      })
      setTaskId(id)
      setMsg(`任务已提交：${id.slice(0, 8)}… 等待 MinerU 完成`)
      const done = await pollTask(id, { intervalMs: 1500 })
      if (done.status === 'failed') {
        throw new Error(done.error || '版面分析失败')
      }
      await applyArtifacts(id)
    } catch (e) {
      setPhase('config')
      setMsg(e instanceof Error ? e.message : '提交失败')
    }
  }

  const openSavedResult = async () => {
    if (!item.last_task_id) return
    setMsg('加载已有版面分析结果…')
    setPhase('running')
    try {
      await applyArtifacts(item.last_task_id)
    } catch (e) {
      setPhase('config')
      setMsg(e instanceof Error ? e.message : '加载失败')
    }
  }

  const handleTranslate = async () => {
    if (!taskId) {
      setMsg('请先完成版面分析')
      return
    }
    setTranslating(true)
    setMsg(null)
    try {
      const id = await translateOneClick(item.upload_id, {
        task_id: taskId,
        parse_backend: modeToBackend(config.mode),
        server_url: config.mode === 'remote' ? remoteServerUrl : null,
      })
      const done = await pollTask(id, { intervalMs: 2000 })
      if (done.status === 'failed') {
        throw new Error(done.error || '翻译失败')
      }
      await applyArtifacts(id)
      setMdView('zh')
      setMsg(null)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '翻译失败')
    } finally {
      setTranslating(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex min-h-0 flex-1 overflow-hidden rounded-3xl bg-white"
    >
      <section className="flex min-h-0 w-[52%] flex-col bg-white">
        <PreviewToolbar
          title={phase === 'result' ? '版面框选' : '原文件'}
          currentPage={currentPage}
          pageCount={pageCount}
          boxCount={phase === 'result' ? layoutBoxes.length : undefined}
          onPrev={() => goToPageRef.current?.(Math.max(1, currentPage - 1))}
          onNext={() => goToPageRef.current?.(Math.min(pageCount || 1, currentPage + 1))}
          onBack={() => setSelectedId(null)}
        />
        <div ref={scrollRef} className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto bg-white">
          <FilePreview
            item={item}
            zoom={100}
            scrollParentRef={scrollRef}
            onPageCount={handlePageCount}
            onCurrentPage={setCurrentPage}
            goToPageRef={goToPageRef}
            layoutBoxes={phase === 'result' ? layoutBoxes : undefined}
            middle={phase === 'result' ? middle : null}
            hoverBoxId={phase === 'result' ? hoverBoxId : null}
            hoverSegId={phase === 'result' ? hoverSegId : null}
            onHoverBox={onHoverBox}
          />
        </div>
      </section>

      <div className="w-px shrink-0 self-stretch bg-gradient-to-b from-transparent via-[#eceef6] to-transparent" />

      <section className="flex min-h-0 w-[48%] flex-col overflow-hidden bg-[#fafbfe]">
        {phase === 'result' ? (
          <>
            <div className="flex shrink-0 items-center gap-2 px-5 pt-3">
              <button
                type="button"
                onClick={() => {
                  setPhase('config')
                  clearHover()
                }}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-[#4f46e5] transition hover:bg-white"
              >
                <ArrowLeft size={14} />
                重新配置
              </button>
              {taskId && (
                <span className="font-mono text-[11px] text-[#9aa0b8]">{taskId.slice(0, 12)}…</span>
              )}
            </div>
            <div className="min-h-0 flex-1">
              <MarkdownPanel
                markdown={markdown}
                zhMarkdown={zhMarkdown}
                segments={activeSegments}
                taskId={taskId}
                filename={item.filename}
                hoverId={hoverSegId}
                onHoverSegment={onHoverSegment}
                onTranslate={() => void handleTranslate()}
                translating={translating}
                linkingZh={linkingZh}
                mdView={mdView}
                onMdViewChange={(v) => void handleMdViewChange(v)}
              />
              {msg && phase === 'result' && !translating && !linkingZh && (
                <p className="px-5 pb-3 text-center text-[12px] text-[#6a70a0]">{msg}</p>
              )}
            </div>
          </>
        ) : (
          <div className="scrollbar-hidden mx-auto flex w-full max-w-lg flex-1 flex-col justify-center overflow-y-auto px-7 py-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-[22px] text-ink">解析配置</h2>
                <p className="mt-1 text-[13px] text-ink-soft">
                  {phase === 'running' ? '正在版面分析，完成后左侧绘制框选、右侧展示 Markdown' : '悬浮选项可查看说明'}
                </p>
              </div>
              {pageCount > 0 && (
                <span className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-[#4f46e5]">
                  共 {pageCount} 页
                </span>
              )}
            </div>

            <div className="mt-4 rounded-2xl bg-white px-4 py-1 shadow-[0_1px_0_rgba(30,42,82,0.04)]">
              <ParseConfigPanel
                value={config}
                onChange={setConfig}
              />
            </div>

            <div className="mt-4 rounded-2xl border border-[#eceef6] bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef0fb]">
                  {phase === 'running' ? (
                    <Loader2 size={18} className="animate-spin text-[#4f46e5]" />
                  ) : (
                    modeIcon(config.mode)
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-ink">
                    {phase === 'running' ? '版面分析进行中' : currentOpt.label}
                    {phase !== 'running' && currentOpt.recommended ? (
                      <span className="ml-2 rounded-md bg-[#7c3aed]/10 px-1.5 py-0.5 text-[11px] font-bold text-[#7c3aed]">
                        推荐
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
                    {phase === 'running'
                      ? '请保持 MinerU API（:8000）与 BFF（:8080）运行。完成后自动进入结果视图。'
                      : currentOpt.tip}
                  </p>
                  <p className="mt-2 font-mono text-[12px] text-[#9aa0b8]">
                    backend: {modeToBackend(config.mode)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white px-4 py-3">
                <p className="text-[12px] font-semibold text-[#9aa0b8]">文件</p>
                <p className="mt-1 truncate text-[14px] font-semibold text-ink">{item.filename}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3">
                <p className="text-[12px] font-semibold text-[#9aa0b8]">规模</p>
                <p className="mt-1 text-[14px] font-semibold text-ink">
                  {formatBytes(item.size)}
                  {pageCount > 0 ? ` · ${pageCount} 页` : ''}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col items-stretch gap-2">
              {phase === 'config' &&
                item.last_task_id &&
                (item.pipeline_stage === 'parsed' ||
                  item.pipeline_stage === 'completed' ||
                  item.last_status === 'done') && (
                <button
                  type="button"
                  onClick={() => void openSavedResult()}
                  className="w-full rounded-xl border border-[#dfe3f5] bg-white px-8 py-3 text-[14px] font-semibold text-[#4f46e5] transition hover:bg-[#f3f4fb]"
                >
                  {item.pipeline_stage === 'completed' || item.has_zh
                    ? '查看已完成结果'
                    : '查看已有解析结果'}
                </button>
              )}
              <motion.button
                type="button"
                whileHover={{ y: -2, boxShadow: '0 10px 28px rgba(99,68,229,0.35)' }}
                whileTap={{ scale: 0.97 }}
                disabled={busy}
                onClick={() => void runParse()}
                className="btn-shine flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] px-8 py-3.5 text-[16px] font-bold text-white shadow-[0_6px_20px_rgba(99,68,229,0.28)] disabled:opacity-60"
              >
                {phase === 'running' ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    分析中…
                  </>
                ) : item.pipeline_stage === 'parsed' ||
                  item.pipeline_stage === 'completed' ||
                  item.last_status === 'done' ? (
                  <>
                    <ScanSearch size={18} />
                    重新版面分析
                  </>
                ) : (
                  <>
                    <ScanSearch size={18} />
                    开始版面分析
                  </>
                )}
              </motion.button>
              {msg && <p className="text-center text-[13px] text-[#6a70a0]">{msg}</p>}
            </div>
          </div>
        )}
      </section>
    </motion.div>
  )
}
