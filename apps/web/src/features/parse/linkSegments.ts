/** Link content_list (MD segments) ↔ middle.json layout boxes. */

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
  /** Layout boxes for this markdown chunk (body / caption / text fragments). */
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

/** Best-matching visual parent group (image/table/chart children) on a page. */
function matchVisualGroupBoxes(
  boxes: LayoutBox[],
  pageIndex: number,
  parentType: string,
  clBbox: BBox | null,
): LayoutBox[] {
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
    if (groups.size > 1 && bestScore <= 0) return []
  }
  return groups.get(bestParent) || []
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
 * Split one MinerU image/table content_list item into separate hover segments
 * so body ↔ caption highlight independently.
 */
function expandVisualSegments(
  item: ContentListItem,
  itemIndex: number,
  boxes: LayoutBox[],
  pageIndex: number,
  clBbox: BBox | null,
): LinkSegment[] {
  const parentType = item.type || 'image'
  const group = matchVisualGroupBoxes(boxes, pageIndex, parentType, clBbox)
  const used = new Set<string>()
  const out: LinkSegment[] = []

  const takeBox = (pred: (b: LayoutBox) => boolean, textHint?: string): string[] => {
    const candidates = group.filter((b) => !used.has(b.id) && pred(b))
    if (textHint?.trim()) {
      const n = normalizeText(textHint)
      const hit = candidates.find((b) => {
        const bt = normalizeText(b.text || '')
        if (!bt || !n) return false
        return bt === n || bt.includes(n) || n.includes(bt)
      })
      if (hit) {
        used.add(hit.id)
        return [hit.id]
      }
    }
    if (candidates[0]) {
      used.add(candidates[0].id)
      return [candidates[0].id]
    }
    return []
  }

  const push = (suffix: string, type: string, markdown: string, boxIds: string[]) => {
    out.push({
      id: `seg-${itemIndex}-${suffix}`,
      pageIndex,
      type,
      markdown,
      color: colorForType(type),
      boxIds,
    })
  }

  if (parentType === 'image' || parentType === 'chart') {
    const path = (item.img_path || '').replace(/\\/g, '/').trim()
    if (path) {
      const rel = path.includes('/') ? path.replace(/^\.\//, '') : `images/${path}`
      const boxIds = takeBox((b) => /body/i.test(b.type) || b.type === parentType)
      push('body', `${parentType}_body`, `![](${rel})`, boxIds)
    }
    ;(item.image_caption || []).forEach((c, ci) => {
      if (!c.trim()) return
      push(
        `cap-${ci}`,
        'image_caption',
        c.trim(),
        takeBox((b) => /caption/i.test(b.type), c),
      )
    })
    ;(item.image_footnote || []).forEach((c, fi) => {
      if (!c.trim()) return
      push(
        `fn-${fi}`,
        'image_footnote',
        c.trim(),
        takeBox((b) => /footnote/i.test(b.type), c),
      )
    })
    return out
  }

  if (parentType === 'table') {
    ;(item.table_caption || []).forEach((c, ci) => {
      if (!c.trim()) return
      push(
        `cap-${ci}`,
        'table_caption',
        c.trim(),
        takeBox((b) => /caption/i.test(b.type), c),
      )
    })
    const body = (item.table_body || '').trim()
    if (body) {
      push(
        'body',
        'table_body',
        body,
        takeBox((b) => /body/i.test(b.type) || b.type === 'table'),
      )
    } else if (!(item.table_caption?.length || item.table_footnote?.length)) {
      push(
        'body',
        'table_body',
        '*(表格)*',
        takeBox((b) => /body/i.test(b.type) || b.type === 'table'),
      )
    }
    ;(item.table_footnote || []).forEach((c, fi) => {
      if (!c.trim()) return
      push(
        `fn-${fi}`,
        'table_footnote',
        c.trim(),
        takeBox((b) => /footnote/i.test(b.type), c),
      )
    })
    return out
  }

  const md = contentItemToMarkdown(item)
  if (md) {
    push('all', parentType, md, group.map((b) => b.id))
  }
  return out
}

/**
 * Build MD segments from content_list and layout boxes from middle.json,
 * then link segments → boxes. Image/table body and captions are separate segments.
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
    const pageIndex = typeof item.page_idx === 'number' ? item.page_idx : 0
    const pageSize = getPageSize(middle, pageIndex) ?? [612, 792]
    const clBbox =
      Array.isArray(item.bbox) && item.bbox.length === 4
        ? contentListBBoxToPdf(item.bbox as BBox, pageSize)
        : null

    if (item.type === 'image' || item.type === 'table' || item.type === 'chart') {
      const parts = expandVisualSegments(item, i, boxes, pageIndex, clBbox)
      for (const seg of parts) {
        for (const id of seg.boxIds) {
          const box = boxes.find((b) => b.id === id)
          if (box && !box.segmentId) box.segmentId = seg.id
        }
        segments.push(seg)
      }
      return
    }

    const markdown = contentItemToMarkdown(item)
    if (markdown == null) return

    const type = displayType(item)
    const segId = `seg-${i}`
    const boxIds = matchTextBoxes(boxes, pageIndex, segmentPlainText(item), clBbox)

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
