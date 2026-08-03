/** MinerU middle.json helpers — bbox in page PDF coordinates + page_size. */

export type BBox = [number, number, number, number]

export type MiddleBlock = {
  type?: string
  bbox?: BBox
  blocks?: MiddleBlock[]
  lines?: Array<{ spans?: Array<{ content?: string; type?: string }> }>
}

export type MiddlePage = {
  page_idx?: number
  page_size?: [number, number]
  para_blocks?: MiddleBlock[]
  tables?: MiddleBlock[]
  images?: MiddleBlock[]
  interline_equations?: MiddleBlock[]
  preproc_blocks?: MiddleBlock[]
}

export type MiddleJson = {
  pdf_info?: MiddlePage[]
  _backend?: string
  _version_name?: string
}

export type LayoutBox = {
  id: string
  pageIndex: number
  type: string
  bbox: BBox
  /** Linked markdown segment id (one segment may own many boxes). */
  segmentId: string | null
  /** Parent para_block index on page (for grouping image/table children). */
  parentIndex: number
  parentType?: string
  text: string
}

const TYPE_COLORS: Record<string, string> = {
  title: '#4f46e5',
  text: '#0ea5e9',
  abstract: '#0ea5e9',
  image: '#22a06b',
  image_body: '#22a06b',
  image_caption: '#16a34a',
  image_footnote: '#15803d',
  table: '#e8801a',
  table_body: '#e8801a',
  table_caption: '#c2410c',
  table_footnote: '#9a3412',
  interline_equation: '#7c3aed',
  equation: '#7c3aed',
  list: '#0891b2',
  index: '#64748b',
  chart: '#db2777',
  chart_body: '#db2777',
  chart_caption: '#be185d',
}

const VISUAL_PARENTS = new Set(['image', 'table', 'chart', 'code'])

export function colorForType(type: string): string {
  return TYPE_COLORS[type] ?? '#6366f1'
}

export function extractBlockText(block: MiddleBlock): string {
  let out = ''
  if (Array.isArray(block.lines)) {
    for (const line of block.lines) {
      for (const span of line.spans || []) {
        if (typeof span.content === 'string') out += span.content
      }
    }
  }
  if (Array.isArray(block.blocks)) {
    for (const child of block.blocks) out += extractBlockText(child)
  }
  return out
}

/**
 * Drawable layout boxes from middle.json.
 * Visual parents (image/table/…) emit child boxes (body + caption) separately;
 * plain text/title emit the top-level para_block box.
 */
export function extractLayoutBoxes(middle: MiddleJson | null | undefined): LayoutBox[] {
  const pages = middle?.pdf_info
  if (!Array.isArray(pages)) return []
  const out: LayoutBox[] = []

  pages.forEach((page, idx) => {
    const pageIndex = typeof page.page_idx === 'number' ? page.page_idx : idx
    const primary = page.para_blocks?.length ? page.para_blocks : page.preproc_blocks
    if (!primary?.length) return

    primary.forEach((block, i) => {
      const type = block.type || 'unknown'
      const children = Array.isArray(block.blocks) ? block.blocks : []

      if (VISUAL_PARENTS.has(type) && children.some((c) => Array.isArray(c.bbox) && c.bbox.length === 4)) {
        children.forEach((child, j) => {
          if (!Array.isArray(child.bbox) || child.bbox.length !== 4) return
          out.push({
            id: `p${pageIndex}-b${i}-c${j}`,
            pageIndex,
            type: child.type || type,
            bbox: child.bbox as BBox,
            segmentId: null,
            parentIndex: i,
            parentType: type,
            text: extractBlockText(child),
          })
        })
        return
      }

      if (Array.isArray(block.bbox) && block.bbox.length === 4) {
        out.push({
          id: `p${pageIndex}-b${i}`,
          pageIndex,
          type,
          bbox: block.bbox as BBox,
          segmentId: null,
          parentIndex: i,
          text: extractBlockText(block),
        })
      }
    })
  })

  return out
}

export function getPageSize(middle: MiddleJson | null | undefined, pageIndex: number): [number, number] | null {
  const page = middle?.pdf_info?.find((p, i) => (p.page_idx ?? i) === pageIndex)
  if (page?.page_size && page.page_size.length === 2) return page.page_size
  return null
}

/** Map PDF-space bbox to CSS % of the rendered page box. */
export function bboxToPercent(bbox: BBox, pageSize: [number, number]): {
  left: string
  top: string
  width: string
  height: string
} {
  const [pw, ph] = pageSize
  const [x0, y0, x1, y1] = bbox
  const left = (Math.min(x0, x1) / pw) * 100
  const top = (Math.min(y0, y1) / ph) * 100
  const width = (Math.abs(x1 - x0) / pw) * 100
  const height = (Math.abs(y1 - y0) / ph) * 100
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
  }
}

export function bboxIou(a: BBox, b: BBox): number {
  const ax0 = Math.min(a[0], a[2])
  const ay0 = Math.min(a[1], a[3])
  const ax1 = Math.max(a[0], a[2])
  const ay1 = Math.max(a[1], a[3])
  const bx0 = Math.min(b[0], b[2])
  const by0 = Math.min(b[1], b[3])
  const bx1 = Math.max(b[0], b[2])
  const by1 = Math.max(b[1], b[3])
  const ix0 = Math.max(ax0, bx0)
  const iy0 = Math.max(ay0, by0)
  const ix1 = Math.min(ax1, bx1)
  const iy1 = Math.min(ay1, by1)
  const iw = Math.max(0, ix1 - ix0)
  const ih = Math.max(0, iy1 - iy0)
  const inter = iw * ih
  if (inter <= 0) return 0
  const areaA = Math.max(0, ax1 - ax0) * Math.max(0, ay1 - ay0)
  const areaB = Math.max(0, bx1 - bx0) * Math.max(0, by1 - by0)
  const union = areaA + areaB - inter
  return union > 0 ? inter / union : 0
}
