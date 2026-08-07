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
  fetchArtifactText,
  pollTask,
  saveTaskLayout,
  uploadTaskImage,
  type UploadItem,
} from '@/services/api'
import { getCachedUploadBlob } from '@/features/parse/previewCache'
import { cropPdfPageRegion } from '@/features/parse/cropPdfRegion'
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
  addLayoutBox,
  deleteLayoutBox,
  EDITABLE_TYPES,
  setLayoutBoxBBox,
  setLayoutBoxType,
} from '@/features/parse/layoutEditOps'
import {
  bboxToPercent,
  colorForType,
  getPageSize,
  type BBox,
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
  editMode,
  onToggleEdit,
  drawMode,
  onToggleDraw,
  selectedBoxId,
  selectedType,
  drawType = 'text',
  onChangeType,
  onDeleteSelected,
  onSaveEdit,
  onCancelEdit,
  saving,
}: {
  currentPage: number
  pageCount: number
  onPrev: () => void
  onNext: () => void
  onBack: () => void
  title?: string
  boxCount?: number
  editMode?: boolean
  onToggleEdit?: () => void
  drawMode?: boolean
  onToggleDraw?: () => void
  selectedBoxId?: string | null
  selectedType?: string
  drawType?: string
  onChangeType?: (t: string) => void
  onDeleteSelected?: () => void
  onSaveEdit?: () => void
  onCancelEdit?: () => void
  saving?: boolean
}) {
  const atStart = currentPage <= 1
  const atEnd = pageCount > 0 ? currentPage >= pageCount : true

  return (
    <header className="relative flex shrink-0 flex-col gap-2 px-4 py-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
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

        <div className="flex items-center justify-end gap-1.5 justify-self-end">
          {onToggleEdit ? (
            <button
              type="button"
              onClick={onToggleEdit}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-semibold transition ${
                editMode ? 'bg-[#4f46e5] text-white' : 'text-[#4f46e5] hover:bg-[#eef0fb]'
              }`}
            >
              {editMode ? '编辑中' : '编辑框选'}
            </button>
          ) : (
            <span className="inline-flex text-[#c5c9dc]" title="预览布局">
              <Columns2 size={17} />
            </span>
          )}
        </div>
      </div>

      {editMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#f3f4fb] px-3 py-2">
          <button
            type="button"
            onClick={onToggleDraw}
            className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold transition ${
              drawMode ? 'bg-[#4f46e5] text-white' : 'bg-white text-[#4f46e5]'
            }`}
          >
            {drawMode ? '绘制中…拖拽松手' : '新画框'}
          </button>
          <label className="flex items-center gap-1.5 text-[12px] text-ink-soft">
            类型
            <select
              value={selectedBoxId ? selectedType || 'text' : drawType || 'text'}
              onChange={(e) => onChangeType?.(e.target.value)}
              className="rounded-md border border-[#dfe3f5] bg-white px-2 py-1 text-[12px] font-semibold text-ink"
            >
              {EDITABLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {!selectedBoxId && drawType === 'image_body' ? (
            <span className="text-[11px] text-[#6a70a0]">新画 image_body 会裁切 PDF 同步到右侧</span>
          ) : null}
          <button
            type="button"
            disabled={!selectedBoxId}
            onClick={onDeleteSelected}
            className="rounded-lg bg-white px-2.5 py-1 text-[12px] font-semibold text-[#dc2626] transition hover:bg-[#fef2f2] disabled:opacity-40"
          >
            删除选中
          </button>
          <span className="flex-1" />
          <button
            type="button"
            disabled={saving}
            onClick={onCancelEdit}
            className="rounded-lg px-2.5 py-1 text-[12px] font-semibold text-[#6a70a0] hover:bg-white"
          >
            取消
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSaveEdit}
            className="inline-flex items-center gap-1 rounded-lg bg-[#4f46e5] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            保存
          </button>
        </div>
      )}
    </header>
  )
}

type OverlayHandlers = {
  onHover: (id: string | null) => void
  editMode?: boolean
  selectedBoxId?: string | null
  drawMode?: boolean
  onSelectBox?: (id: string | null) => void
  onBoxBBoxCommit?: (id: string, bbox: BBox) => void
  onDrawComplete?: (pageIndex: number, bbox: BBox) => void
}

function paintOverlays(
  pageEls: HTMLElement[],
  boxes: LayoutBox[],
  middle: MiddleJson | null,
  handlers: OverlayHandlers,
) {
  const {
    onHover,
    editMode = false,
    selectedBoxId = null,
    drawMode = false,
    onSelectBox,
    onBoxBBoxCommit,
    onDrawComplete,
  } = handlers

  for (const wrap of pageEls) {
    const pageNum = Number(wrap.dataset.page || 1)
    const pageIndex = pageNum - 1
    const layer = wrap.querySelector<HTMLElement>('[data-overlay-layer]')
    const frame = wrap.querySelector<HTMLElement>('[data-page-frame]')
    if (!layer || !frame) continue

    layer.innerHTML = ''
    const pageSize = getPageSize(middle, pageIndex)
    if (!pageSize) continue

    // Draw-new-box rubber band on this page
    if (editMode && drawMode && onDrawComplete) {
      layer.style.cursor = 'crosshair'
      let start: { x: number; y: number } | null = null
      let rubber: HTMLDivElement | null = null

      const toPdf = (clientX: number, clientY: number): [number, number] => {
        const r = frame.getBoundingClientRect()
        const x = ((clientX - r.left) / r.width) * pageSize[0]
        const y = ((clientY - r.top) / r.height) * pageSize[1]
        return [x, y]
      }

      layer.onmousedown = (ev) => {
        if (ev.button !== 0) return
        ev.preventDefault()
        ev.stopPropagation()
        start = { x: ev.clientX, y: ev.clientY }
        rubber = document.createElement('div')
        rubber.className = 'pointer-events-none absolute border-2 border-dashed border-[#4f46e5] bg-[#4f46e5]/15'
        layer.appendChild(rubber)
      }
      layer.onmousemove = (ev) => {
        if (!start || !rubber) return
        const r = frame.getBoundingClientRect()
        const x0 = Math.min(start.x, ev.clientX) - r.left
        const y0 = Math.min(start.y, ev.clientY) - r.top
        const w = Math.abs(ev.clientX - start.x)
        const h = Math.abs(ev.clientY - start.y)
        rubber.style.left = `${(x0 / r.width) * 100}%`
        rubber.style.top = `${(y0 / r.height) * 100}%`
        rubber.style.width = `${(w / r.width) * 100}%`
        rubber.style.height = `${(h / r.height) * 100}%`
      }
      layer.onmouseup = (ev) => {
        if (!start) return
        const [x0, y0] = toPdf(start.x, start.y)
        const [x1, y1] = toPdf(ev.clientX, ev.clientY)
        start = null
        rubber?.remove()
        rubber = null
        const bbox: BBox = [
          Math.min(x0, x1),
          Math.min(y0, y1),
          Math.max(x0, x1),
          Math.max(y0, y1),
        ]
        if (Math.abs(bbox[2] - bbox[0]) < 8 || Math.abs(bbox[3] - bbox[1]) < 8) return
        onDrawComplete(pageIndex, bbox)
      }
    } else {
      layer.onmousedown = null
      layer.onmousemove = null
      layer.onmouseup = null
      layer.style.cursor = ''
    }

    if (drawMode) continue // only rubber-band while drawing

    const pageBoxes = boxes.filter((b) => b.pageIndex === pageIndex)
    for (const box of pageBoxes) {
      const pct = bboxToPercent(box.bbox, pageSize)
      const color = colorForType(box.type)
      const selected = editMode && selectedBoxId === box.id

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
      el.style.border = selected ? `2.5px solid ${color}` : `1.5px solid ${color}`
      el.style.background = selected ? `${color}33` : `${color}14`
      el.style.boxShadow = selected ? `0 0 0 2px ${color}` : 'none'
      el.style.cursor = editMode ? 'pointer' : 'pointer'
      el.style.overflow = 'visible'
      el.style.zIndex = selected ? '8' : '1'

      const label = document.createElement('span')
      label.dataset.boxLabel = '1'
      label.textContent = box.type
      label.className =
        'pointer-events-none absolute left-0 top-0 z-10 max-w-full truncate rounded-br px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm'
      label.style.backgroundColor = color
      label.style.opacity = editMode || selected ? '1' : '0'
      label.style.transition = 'opacity 120ms ease'

      if (editMode) {
        el.addEventListener('click', (ev) => {
          ev.preventDefault()
          ev.stopPropagation()
          onSelectBox?.(box.id)
        })
        // Move whole box by dragging body
        el.addEventListener('mousedown', (ev) => {
          if (ev.button !== 0 || (ev.target as HTMLElement).dataset.handle) return
          if (selectedBoxId !== box.id) return
          ev.preventDefault()
          ev.stopPropagation()
          const startX = ev.clientX
          const startY = ev.clientY
          const [bx0, by0, bx1, by1] = box.bbox
          const r = frame.getBoundingClientRect()
          const onMove = (e: MouseEvent) => {
            const dx = ((e.clientX - startX) / r.width) * pageSize[0]
            const dy = ((e.clientY - startY) / r.height) * pageSize[1]
            const nb: BBox = [bx0 + dx, by0 + dy, bx1 + dx, by1 + dy]
            const p = bboxToPercent(nb, pageSize)
            el.style.left = p.left
            el.style.top = p.top
            el.style.width = p.width
            el.style.height = p.height
            ;(el as HTMLButtonElement & { _draftBBox?: BBox })._draftBBox = nb
          }
          const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
            const draft = (el as HTMLButtonElement & { _draftBBox?: BBox })._draftBBox
            if (draft) onBoxBBoxCommit?.(box.id, draft)
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        })
      } else {
        el.addEventListener('mouseenter', () => onHover(box.id))
        el.addEventListener('mouseleave', () => onHover(null))
      }

      if (selected && onBoxBBoxCommit) {
        const handle = document.createElement('span')
        handle.dataset.handle = 'se'
        handle.className = 'absolute bottom-0 right-0 z-20 h-3 w-3 translate-x-1/2 translate-y-1/2 rounded-sm bg-white'
        handle.style.border = `2px solid ${color}`
        handle.style.cursor = 'nwse-resize'
        handle.addEventListener('mousedown', (ev) => {
          ev.preventDefault()
          ev.stopPropagation()
          const startX = ev.clientX
          const startY = ev.clientY
          const [bx0, by0, bx1, by1] = box.bbox
          const r = frame.getBoundingClientRect()
          const onMove = (e: MouseEvent) => {
            const dx = ((e.clientX - startX) / r.width) * pageSize[0]
            const dy = ((e.clientY - startY) / r.height) * pageSize[1]
            const nb: BBox = [bx0, by0, Math.max(bx0 + 8, bx1 + dx), Math.max(by0 + 8, by1 + dy)]
            const p = bboxToPercent(nb, pageSize)
            el.style.width = p.width
            el.style.height = p.height
            ;(el as HTMLButtonElement & { _draftBBox?: BBox })._draftBBox = nb
          }
          const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
            const draft = (el as HTMLButtonElement & { _draftBBox?: BBox })._draftBBox
            if (draft) onBoxBBoxCommit(box.id, draft)
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        })
        el.appendChild(handle)
      }

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
  editMode = false,
  selectedBoxId = null,
  drawMode = false,
  onSelectBox,
  onBoxBBoxCommit,
  onDrawComplete,
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
  editMode?: boolean
  selectedBoxId?: string | null
  drawMode?: boolean
  onSelectBox?: (id: string | null) => void
  onBoxBBoxCommit?: (id: string, bbox: BBox) => void
  onDrawComplete?: (pageIndex: number, bbox: BBox) => void
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
  const editRef = useRef({
    editMode,
    selectedBoxId,
    drawMode,
    onSelectBox,
    onBoxBBoxCommit,
    onDrawComplete,
  })
  editRef.current = {
    editMode,
    selectedBoxId,
    drawMode,
    onSelectBox,
    onBoxBBoxCommit,
    onDrawComplete,
  }

  const syncOverlays = useCallback(() => {
    const boxes = layoutBoxesRef.current ?? []
    const ed = editRef.current
    paintOverlays(pageElsRef.current, boxes, middleRef.current, {
      onHover: (id) => hoverRef.current?.(id),
      editMode: ed.editMode,
      selectedBoxId: ed.selectedBoxId,
      drawMode: ed.drawMode,
      onSelectBox: ed.onSelectBox,
      onBoxBBoxCommit: ed.onBoxBBoxCommit,
      onDrawComplete: ed.onDrawComplete,
    })
    for (const wrap of pageElsRef.current) {
      const layer = wrap.querySelector<HTMLElement>('[data-overlay-layer]')
      if (!layer) continue
      layer.style.pointerEvents = boxes.length || ed.editMode ? 'auto' : 'none'
      for (const child of Array.from(layer.children)) {
        ;(child as HTMLElement).style.pointerEvents = 'auto'
      }
    }
  }, [])

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

        const paint = () => {
          syncOverlays()
        }

        // First page ASAP, then the rest — avoids long full-doc lock
        await renderPage(1)
        if (!cancelled) {
          setLoading(false)
          paint()
        }

        for (let i = 2; i <= doc.numPages; i++) {
          if (cancelled) break
          await renderPage(i)
          if (!cancelled) paint()
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
  }, [blob, onPageCount, onCurrentPage, syncOverlays])

  // Paint / refresh layout boxes after pages exist / boxes change / edit state
  useEffect(() => {
    if (loading) return
    syncOverlays()
  }, [
    loading,
    layoutBoxes,
    middle,
    editMode,
    selectedBoxId,
    drawMode,
    syncOverlays,
  ])

  // Hover highlight without rebuilding boxes (view mode only)
  useEffect(() => {
    if (loading || editMode) return
    updateOverlayHighlight(pageElsRef.current, hoverBoxId ?? null, hoverSegId ?? null)
  }, [loading, hoverBoxId, hoverSegId, layoutBoxes, editMode])

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

/** Shared original-file preview (PDF / image / text). Used by workspace + reading room. */
export function FilePreview({
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
  editMode,
  selectedBoxId,
  drawMode,
  onSelectBox,
  onBoxBBoxCommit,
  onDrawComplete,
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
  editMode?: boolean
  selectedBoxId?: string | null
  drawMode?: boolean
  onSelectBox?: (id: string | null) => void
  onBoxBBoxCommit?: (id: string, bbox: BBox) => void
  onDrawComplete?: (pageIndex: number, bbox: BBox) => void
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
        editMode={editMode}
        selectedBoxId={selectedBoxId}
        drawMode={drawMode}
        onSelectBox={onSelectBox}
        onBoxBBoxCommit={onBoxBBoxCommit}
        onDrawComplete={onDrawComplete}
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
  const [translateProgress, setTranslateProgress] = useState<{
    ratio?: number
    message?: string
  } | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null)
  const [draftMiddle, setDraftMiddle] = useState<MiddleJson | null>(null)
  const [draftContentList, setDraftContentList] = useState<ContentListItem[] | null>(null)
  const [savingLayout, setSavingLayout] = useState(false)
  const [drawType, setDrawType] = useState('text')
  /** Avoid re-fetching the same bound task after runParse / restore. */
  const boundShownRef = useRef<string | null>(null)
  const busy = busyId === item.upload_id || phase === 'running'
  const currentOpt = PARSE_MODE_OPTIONS.find((o) => o.mode === config.mode) ?? PARSE_MODE_OPTIONS[1]
  const remoteServerUrl =
    (import.meta.env.VITE_MINERU_SERVER_URL as string | undefined)?.trim() ||
    'http://127.0.0.1:30000'

  const activeMiddle = editMode && draftMiddle ? draftMiddle : middle
  const activeContentList = editMode && draftContentList ? draftContentList : contentList

  const { segments: enSegments, boxes: layoutBoxes } = useMemo(
    () => buildLinkedLayout(activeContentList, activeMiddle),
    [activeContentList, activeMiddle],
  )

  const zhSegments = useMemo(
    () => buildZhLinkedSegments(contentListZh, middle, enSegments),
    [contentListZh, middle, enSegments],
  )

  const activeSegments = editMode ? enSegments : mdView === 'zh' ? zhSegments : enSegments

  const boxById = useMemo(() => {
    const m = new Map<string, LayoutBox>()
    for (const b of layoutBoxes) m.set(b.id, b)
    return m
  }, [layoutBoxes])

  const selectedBox = selectedBoxId ? boxById.get(selectedBoxId) : undefined

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
      if (editMode) return
      if (!id) {
        clearHover()
        return
      }
      setHoverBoxId(id)
      setHoverSegId(boxById.get(id)?.segmentId ?? null)
    },
    [boxById, clearHover, editMode],
  )

  const onHoverSegment = useCallback(
    (id: string | null) => {
      if (editMode) return
      if (!id) {
        clearHover()
        return
      }
      setHoverSegId(id)
      setHoverBoxId(null)
    },
    [clearHover, editMode],
  )

  const enterEditMode = useCallback(() => {
    if (!middle || !contentList) {
      setMsg('暂无版面数据可编辑')
      return
    }
    setDraftMiddle(JSON.parse(JSON.stringify(middle)) as MiddleJson)
    setDraftContentList(JSON.parse(JSON.stringify(contentList)) as ContentListItem[])
    setEditMode(true)
    setDrawMode(false)
    setSelectedBoxId(null)
    setMdView('en')
    clearHover()
    setMsg('编辑模式：点击选中框，可改类型、拖动、缩放或删除；也可新画框')
  }, [middle, contentList, clearHover])

  const cancelEditMode = useCallback(() => {
    setEditMode(false)
    setDrawMode(false)
    setSelectedBoxId(null)
    setDraftMiddle(null)
    setDraftContentList(null)
    setMsg(null)
  }, [])

  const applyDraft = useCallback(
    (next: { middle: MiddleJson; contentList: ContentListItem[] }) => {
      setDraftMiddle(next.middle)
      setDraftContentList(next.contentList)
    },
    [],
  )

  const handleDeleteSelected = useCallback(() => {
    if (!selectedBoxId || !draftMiddle || !draftContentList) return
    const next = deleteLayoutBox(draftMiddle, draftContentList, selectedBoxId)
    applyDraft(next)
    setSelectedBoxId(null)
    setMsg('已删除框选，右侧内容已同步更新（保存后写入文件）')
  }, [selectedBoxId, draftMiddle, draftContentList, applyDraft])

  const handleChangeType = useCallback(
    (t: string) => {
      if (!selectedBoxId || !draftMiddle || !draftContentList) return
      const next = setLayoutBoxType(draftMiddle, draftContentList, selectedBoxId, t)
      applyDraft(next)
    },
    [selectedBoxId, draftMiddle, draftContentList, applyDraft],
  )

  const handleBoxBBoxCommit = useCallback(
    (id: string, bbox: BBox) => {
      if (!draftMiddle || !draftContentList) return
      applyDraft(setLayoutBoxBBox(draftMiddle, draftContentList, id, bbox))
    },
    [draftMiddle, draftContentList, applyDraft],
  )

  const handleDrawComplete = useCallback(
    (pageIndex: number, bbox: BBox) => {
      if (!draftMiddle || !draftContentList) return
      void (async () => {
        setDrawMode(false)
        if (drawType === 'image_body' || drawType === 'image') {
          if (!taskId) {
            setMsg('缺少任务 ID，无法保存裁切图片')
            return
          }
          setMsg('正在截取框选区域并同步到右侧…')
          try {
            const pdfBlob = await getCachedUploadBlob(item.upload_id)
            const cropped = await cropPdfPageRegion(pdfBlob, pageIndex, bbox)
            const uploaded = await uploadTaskImage(taskId, cropped, 'crop.png')
            const next = addLayoutBox(draftMiddle, draftContentList, pageIndex, bbox, 'image_body', {
              imgPath: uploaded.img_path,
            })
            applyDraft(next)
            setMsg('已添加图片框，右侧已显示裁切图（记得保存）')
          } catch (e) {
            setMsg(e instanceof Error ? e.message : '截取图片失败')
          }
          return
        }
        const next = addLayoutBox(draftMiddle, draftContentList, pageIndex, bbox, drawType, '')
        applyDraft(next)
        setMsg(
          drawType.includes('caption')
            ? '已添加文字框（误标 caption 建议直接删除原框）'
            : '已添加新框（无 OCR 文字时可稍后重译或手改 MD）',
        )
      })()
    },
    [draftMiddle, draftContentList, drawType, applyDraft, taskId, item.upload_id],
  )

  // Delete key in edit mode
  useEffect(() => {
    if (!editMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        handleDeleteSelected()
      }
      if (e.key === 'Escape') {
        if (drawMode) setDrawMode(false)
        else setSelectedBoxId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editMode, drawMode, handleDeleteSelected])

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

  const handleSaveLayout = useCallback(async () => {
    if (!taskId || !draftMiddle || !draftContentList) return
    setSavingLayout(true)
    setMsg('正在保存版面修正…')
    try {
      const res = await saveTaskLayout(taskId, draftMiddle, draftContentList)
      setEditMode(false)
      setDrawMode(false)
      setSelectedBoxId(null)
      setDraftMiddle(null)
      setDraftContentList(null)
      boundShownRef.current = null
      await applyArtifacts(taskId)
      setMsg(
        res.zh_stale
          ? '版面已保存并刷新 Markdown。译文已过期，请重新翻译以更新联动。'
          : '版面已保存，右侧 Markdown 已更新',
      )
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSavingLayout(false)
    }
  }, [taskId, draftMiddle, draftContentList, applyArtifacts])

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
    setTranslateProgress({ ratio: 0.02, message: '准备翻译…' })
    setMsg(null)
    try {
      const id = await translateOneClick(item.upload_id, {
        task_id: taskId,
        parse_backend: modeToBackend(config.mode),
        server_url: config.mode === 'remote' ? remoteServerUrl : null,
      })
      const done = await pollTask(id, {
        intervalMs: 1200,
        onUpdate: (task) => {
          const p = task.progress
          if (p && typeof p.ratio === 'number') {
            setTranslateProgress({
              ratio: p.ratio,
              message: p.message,
            })
          }
        },
      })
      if (done.status === 'failed') {
        // MD may already exist if only post-steps (e.g. PDF) failed
        try {
          const zh = await fetchArtifactText(id, 'zh_markdown')
          if (zh?.trim()) {
            setTranslateProgress({ ratio: 1, message: '完成' })
            await applyArtifacts(id)
            setMdView('zh')
            setMsg(`译文已生成，但有步骤失败：${done.error || '未知错误'}（可稍后重试导出）`)
            return
          }
        } catch {
          /* fall through */
        }
        throw new Error(done.error || '翻译失败')
      }
      setTranslateProgress({ ratio: 1, message: '完成' })
      await applyArtifacts(id)
      setMdView('zh')
      setMsg(null)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '翻译失败')
    } finally {
      setTranslating(false)
      setTranslateProgress(null)
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
          title={phase === 'result' ? (editMode ? '框选编辑' : '版面框选') : '原文件'}
          currentPage={currentPage}
          pageCount={pageCount}
          boxCount={phase === 'result' ? layoutBoxes.length : undefined}
          onPrev={() => goToPageRef.current?.(Math.max(1, currentPage - 1))}
          onNext={() => goToPageRef.current?.(Math.min(pageCount || 1, currentPage + 1))}
          onBack={() => setSelectedId(null)}
          editMode={editMode}
          onToggleEdit={
            phase === 'result'
              ? () => {
                  if (editMode) cancelEditMode()
                  else enterEditMode()
                }
              : undefined
          }
          drawMode={drawMode}
          onToggleDraw={() => setDrawMode((v) => !v)}
          selectedBoxId={selectedBoxId}
          selectedType={selectedBox?.type || drawType}
          drawType={drawType}
          onChangeType={(t) => {
            if (selectedBoxId) handleChangeType(t)
            else setDrawType(t)
          }}
          onDeleteSelected={handleDeleteSelected}
          onSaveEdit={() => void handleSaveLayout()}
          onCancelEdit={cancelEditMode}
          saving={savingLayout}
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
            middle={phase === 'result' ? activeMiddle : null}
            hoverBoxId={phase === 'result' && !editMode ? hoverBoxId : null}
            hoverSegId={phase === 'result' && !editMode ? hoverSegId : null}
            onHoverBox={onHoverBox}
            editMode={editMode}
            selectedBoxId={selectedBoxId}
            drawMode={drawMode}
            onSelectBox={setSelectedBoxId}
            onBoxBBoxCommit={handleBoxBBoxCommit}
            onDrawComplete={handleDrawComplete}
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
                translateProgress={translateProgress}
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
