/** Link content_list (MD segments) ↔ middle.json layout boxes (1 segment : N boxes). */

import {
  bboxIou,
  colorForType,
  extractLayoutBoxes,
  getPageSize,
  type BBox,
  type LayoutBox,
  type MiddleJson,
} from '@/features/parse/middleTypes'

export type ContentListItem = {
  type?: string
  page_idx?: number
  bbox?: BBox
  text?: string
  text_level?: number
  text_format?: string
  img_path?: string
  image_caption?: string[]
  image_footnote?: string[]
  table_caption?: string[]
  table_footnote?: string[]
  table_body?: string
}

export type LinkSegment = {
  id: string
  pageIndex: number
  type: string
  markdown: string
  color: string
  /** All layout boxes belonging to this markdown chunk (e.g. image+caption, or two column fragments). */
  boxIds: string[]
}

/** content_list bbox is normalized to 0–1000 (MinerU). Always map to PDF page coords. */
export function contentListBBoxToPdf(bbox: BBox, pageSize: [number, number]): BBox {
  const [pw, ph] = pageSize
  const [x0, y0, x1, y1] = bbox
  return [(x0 / 1000) * pw, (y0 / 1000) * ph, (x1 / 1000) * pw, (y1 / 1000) * ph]
}

function contentItemToMarkdown(item: ContentListItem): string | null {
  const type = item.type || 'text'

  if (type === 'aside_text' || type === 'header' || type === 'footer' || type === 'page_number') {
    return null
  }

  if (type === 'image') {
    const parts: string[] = []
    const path = (item.img_path || '').replace(/\\/g, '/').trim()
    if (path) {
      const rel = path.includes('/') ? path.replace(/^\.\//, '') : `images/${path}`
      parts.push(`![](${rel})`)
    }
    for (const c of [...(item.image_caption || []), ...(item.image_footnote || [])]) {
      if (c.trim()) parts.push(c.trim())
    }
    if (parts.length) return parts.join('\n\n')
    return null
  }

  if (type === 'table') {
    const parts: string[] = []
    for (const c of item.table_caption || []) if (c.trim()) parts.push(c.trim())
    if (item.table_body?.trim()) parts.push(item.table_body.trim())
    for (const c of item.table_footnote || []) if (c.trim()) parts.push(c.trim())
    if (parts.length) return parts.join('\n\n')
    return '*(表格)*'
  }

  if (type === 'equation') {
    const t = (item.text || '').trim()
    return t || null
  }

  const text = (item.text || '').trim()
  if (!text) return null
  const level = item.text_level
  if (typeof level === 'number' && level > 0) {
    return `${'#'.repeat(Math.min(6, level))} ${text}`
  }
  return text
}

function displayType(item: ContentListItem): string {
  if (item.type === 'text' && item.text_level) return 'title'
  if (item.type === 'equation') return 'interline_equation'
  return item.type || 'text'
}

function normalizeText(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/gi, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function segmentPlainText(item: ContentListItem): string {
  if (item.type === 'image') {
    return [...(item.image_caption || []), ...(item.image_footnote || [])].join('')
  }
  if (item.type === 'table') {
    return [...(item.table_caption || []), item.table_body || '', ...(item.table_footnote || [])].join('')
  }
  return item.text || ''
}

function matchVisualGroup(
  boxes: LayoutBox[],
  pageIndex: number,
  parentType: string,
  clBbox: BBox | null,
): string[] {
  const groups = new Map<number, LayoutBox[]>()
  for (const b of boxes) {
    if (b.pageIndex !== pageIndex) continue
    if (b.parentType !== parentType) continue
    const list = groups.get(b.parentIndex) || []
    list.push(b)
    groups.set(b.parentIndex, list)
  }
  if (!groups.size) return []

  let bestParent: number | null = null
  let bestScore = -1
  for (const [parentIndex, group] of groups) {
    const body =
      group.find((g) => /body/i.test(g.type)) ||
      group.find((g) => g.type === parentType) ||
      group[0]
    const score = clBbox ? bboxIou(clBbox, body.bbox) : 0
    if (score > bestScore) {
      bestScore = score
      bestParent = parentIndex
    }
  }
  if (bestParent == null) return []
  if (clBbox && bestScore < 0.05) {
    // Weak geometry — still take best group if unique on page
    if (groups.size > 1 && bestScore <= 0) return []
  }
  return (groups.get(bestParent) || []).map((b) => b.id)
}

function matchTextBoxes(
  boxes: LayoutBox[],
  pageIndex: number,
  segTextRaw: string,
  clBbox: BBox | null,
): string[] {
  const segText = normalizeText(segTextRaw)
  const pageBoxes = boxes.filter(
    (b) => b.pageIndex === pageIndex && !b.parentType,
  )
  const matched = new Set<string>()

  if (segText.length >= 8) {
    for (const b of pageBoxes) {
      const bt = normalizeText(b.text || '')
      if (bt.length < 8) continue
      if (segText.includes(bt) || (bt.length <= segText.length + 20 && bt.includes(segText))) {
        matched.add(b.id)
      }
    }
  }

  // Always attach best IoU box (primary fragment) so single-column still links
  if (clBbox) {
    let bestId: string | null = null
    let best = 0.12
    for (const b of pageBoxes) {
      const score = bboxIou(clBbox, b.bbox)
      if (score > best) {
        best = score
        bestId = b.id
      }
    }
    if (bestId) matched.add(bestId)
  }

  return [...matched]
}

/**
 * Build MD segments from content_list and layout boxes from middle.json,
 * then link 1 segment → N boxes (image+caption, cross-column fragments, …).
 */
export function buildLinkedLayout(
  contentList: ContentListItem[] | null | undefined,
  middle: MiddleJson | null | undefined,
): { segments: LinkSegment[]; boxes: LayoutBox[] } {
  const boxes = extractLayoutBoxes(middle)
  if (!Array.isArray(contentList) || !contentList.length) {
    return { segments: [], boxes }
  }

  const segments: LinkSegment[] = []

  contentList.forEach((item, i) => {
    const markdown = contentItemToMarkdown(item)
    if (markdown == null) return

    const pageIndex = typeof item.page_idx === 'number' ? item.page_idx : 0
    const pageSize = getPageSize(middle, pageIndex) ?? [612, 792]
    const clBbox =
      Array.isArray(item.bbox) && item.bbox.length === 4
        ? contentListBBoxToPdf(item.bbox as BBox, pageSize)
        : null
    const type = displayType(item)
    const segId = `seg-${i}`

    let boxIds: string[] = []
    if (item.type === 'image' || item.type === 'table' || item.type === 'chart') {
      boxIds = matchVisualGroup(boxes, pageIndex, item.type, clBbox)
    } else {
      boxIds = matchTextBoxes(boxes, pageIndex, segmentPlainText(item), clBbox)
    }

    for (const id of boxIds) {
      const box = boxes.find((b) => b.id === id)
      if (box && !box.segmentId) box.segmentId = segId
    }

    segments.push({
      id: segId,
      pageIndex,
      type,
      markdown,
      color: colorForType(type),
      boxIds,
    })
  })

  return { segments, boxes }
}

/**
 * Build ZH segments from translated content_list, reusing EN boxIds so hover
 * links stay identical (ZH text would not match English box OCR).
 */
export function buildZhLinkedSegments(
  contentListZh: ContentListItem[] | null | undefined,
  middle: MiddleJson | null | undefined,
  enSegments: LinkSegment[],
): LinkSegment[] {
  if (!Array.isArray(contentListZh) || !contentListZh.length) return []
  const { segments: zhRaw } = buildLinkedLayout(contentListZh, middle)
  const enById = new Map(enSegments.map((s) => [s.id, s]))
  return zhRaw.map((seg) => {
    const en = enById.get(seg.id)
    return en ? { ...seg, boxIds: en.boxIds } : seg
  })
}

/** @deprecated use buildLinkedLayout */
export function buildLinkSegments(
  contentList: ContentListItem[] | null | undefined,
  middle: MiddleJson | null | undefined,
): LinkSegment[] {
  return buildLinkedLayout(contentList, middle).segments
}
