/** Plan A: mutate middle.json + content_list.json in lockstep for layout edits. */

import type { ContentListItem } from '@/features/parse/linkSegments'
import type { BBox, MiddleBlock, MiddleJson, MiddlePage } from '@/features/parse/middleTypes'
import { bboxIou, extractBlockText } from '@/features/parse/middleTypes'

const BOX_ID_RE = /^p(\d+)-b(\d+)(?:-c(\d+))?$/

export type BoxRef = {
  pageIndex: number
  blockIndex: number
  childIndex: number | null
}

export function parseBoxId(id: string): BoxRef | null {
  const m = BOX_ID_RE.exec(id)
  if (!m) return null
  return {
    pageIndex: Number(m[1]),
    blockIndex: Number(m[2]),
    childIndex: m[3] != null ? Number(m[3]) : null,
  }
}

function cloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function getPage(middle: MiddleJson, pageIndex: number): MiddlePage | null {
  const pages = middle.pdf_info
  if (!Array.isArray(pages)) return null
  return pages.find((p, i) => (p.page_idx ?? i) === pageIndex) ?? null
}

function getPrimaryBlocks(page: MiddlePage): MiddleBlock[] | null {
  if (page.para_blocks?.length) return page.para_blocks
  if (page.preproc_blocks?.length) return page.preproc_blocks
  return null
}

function setPrimaryBlocks(page: MiddlePage, blocks: MiddleBlock[]): void {
  if (page.para_blocks?.length) page.para_blocks = blocks
  else page.preproc_blocks = blocks
}

function pdfBBoxToContentList(bbox: BBox, pageSize: [number, number]): BBox {
  const [pw, ph] = pageSize
  return [
    (bbox[0] / pw) * 1000,
    (bbox[1] / ph) * 1000,
    (bbox[2] / pw) * 1000,
    (bbox[3] / ph) * 1000,
  ]
}

/**
 * Geometric reading-order compare (MinerU XY-cut fallback style).
 * Same horizontal band → left-to-right; otherwise top-to-bottom.
 * Works for both PDF-space and 0–1000 content_list bboxes.
 */
export function readingOrderBefore(a: BBox, b: BBox): boolean {
  const [ax0, ay0, ax1, ay1] = a
  const [bx0, by0, bx1, by1] = b
  const aMidY = (ay0 + ay1) / 2
  const bMidY = (by0 + by1) / 2
  const aH = Math.max(1, Math.abs(ay1 - ay0))
  const bH = Math.max(1, Math.abs(by1 - by0))
  const band = Math.max(aH, bH) * 0.55
  if (Math.abs(aMidY - bMidY) <= band) {
    return Math.min(ax0, ax1) < Math.min(bx0, bx1)
  }
  return aMidY < bMidY
}

/** Insert index into page-ordered content_list for a new item on `pageIndex`. */
function findContentListInsertIndex(
  list: ContentListItem[],
  pageIndex: number,
  clBBox: BBox,
): number {
  // After all earlier pages; among same page, by reading order; before later pages.
  for (let i = 0; i < list.length; i++) {
    const it = list[i]
    const p = it.page_idx ?? 0
    if (p > pageIndex) return i
    if (p < pageIndex) continue
    if (!Array.isArray(it.bbox) || it.bbox.length !== 4) continue
    if (readingOrderBefore(clBBox, it.bbox as BBox)) return i
  }
  return list.length
}

/** Insert index into para_blocks by PDF-space reading order. */
function findBlockInsertIndex(blocks: MiddleBlock[], bbox: BBox): number {
  for (let i = 0; i < blocks.length; i++) {
    const bb = blocks[i].bbox
    if (!Array.isArray(bb) || bb.length !== 4) continue
    if (readingOrderBefore(bbox, bb as BBox)) return i
  }
  return blocks.length
}

function normText(s: string): string {
  return s.replace(/\s+/g, '')
}

function findContentIndexByText(
  list: ContentListItem[],
  pageIndex: number,
  text: string,
): number {
  const norm = normText(text)
  if (!norm) return -1
  return list.findIndex((item) => {
    if ((item.page_idx ?? 0) !== pageIndex) return false
    const t = normText(item.text || '')
    if (t && (t === norm || t.includes(norm) || norm.includes(t))) return true
    const caps = [...(item.image_caption || []), ...(item.table_caption || [])]
    return caps.some((c) => normText(c) === norm)
  })
}

/** Best content_list visual item (image/table) by bbox IoU on the page. */
function findVisualItemIndex(
  list: ContentListItem[],
  pageIndex: number,
  pdfBBox: BBox | undefined,
  pageSize: [number, number],
  types: string[],
): number {
  if (!pdfBBox || pdfBBox.length !== 4) return -1
  const target = pdfBBoxToContentList(pdfBBox, pageSize)
  let best = -1
  let bestScore = 0.06
  for (let i = 0; i < list.length; i++) {
    const it = list[i]
    if ((it.page_idx ?? 0) !== pageIndex) continue
    if (!types.includes(it.type || '')) continue
    if (!Array.isArray(it.bbox) || it.bbox.length !== 4) continue
    const score = bboxIou(target, it.bbox as BBox)
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return best
}

function imgFileName(path: string | undefined): string | null {
  if (!path) return null
  const name = path.replace(/\\/g, '/').split('/').pop()
  return name || null
}

/**
 * Remove caption / footnote text from the matching image|table item,
 * and also drop any standalone text/title items that duplicate that region
 * (common when MinerU mislabels body text as image_caption).
 */
function removeCaptionLikeFromContentList(
  list: ContentListItem[],
  pageIndex: number,
  captionText: string,
  captionBBox: BBox | undefined,
  parentBBox: BBox | undefined,
  pageSize: [number, number],
  childType: string,
  opts?: { removeStandalone?: boolean },
): void {
  const keys =
    childType.includes('table')
      ? (['table_caption', 'table_footnote'] as const)
      : (['image_caption', 'image_footnote'] as const)
  const visualTypes = childType.includes('table') ? ['table'] : ['image']
  const n = normText(captionText)
  const removeStandalone = opts?.removeStandalone !== false

  const visualIdx = findVisualItemIndex(list, pageIndex, parentBBox || captionBBox, pageSize, visualTypes)
  if (visualIdx >= 0) {
    const item = list[visualIdx]
    let stripped = false
    for (const key of keys) {
      const arr = item[key]
      if (!Array.isArray(arr)) continue
      if (n) {
        for (let i = arr.length - 1; i >= 0; i--) {
          const cn = normText(arr[i])
          if (cn === n || (n.length >= 6 && (cn.includes(n) || n.includes(cn)))) {
            arr.splice(i, 1)
            stripped = true
          }
        }
      }
    }
    // No text match (empty OCR / mismatch): drop first caption/footnote of matching kind
    if (!stripped) {
      const preferKey = childType.includes('footnote')
        ? keys.find((k) => k.includes('footnote')) || keys[0]
        : keys.find((k) => k.includes('caption')) || keys[0]
      const arr = item[preferKey]
      if (Array.isArray(arr) && arr.length) arr.shift()
    }
  } else if (n) {
    for (const item of list) {
      if ((item.page_idx ?? 0) !== pageIndex) continue
      for (const key of keys) {
        const arr = item[key]
        if (!Array.isArray(arr)) continue
        const idx = arr.findIndex((c) => normText(c) === n)
        if (idx >= 0) arr.splice(idx, 1)
      }
    }
  }

  if (!removeStandalone) return

  // Drop standalone text that is the mislabeled caption (same text or overlapping bbox)
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i]
    if ((it.page_idx ?? 0) !== pageIndex) continue
    const typ = it.type || 'text'
    if (typ !== 'text' && typ !== 'title') continue
    const t = normText(it.text || '')
    if (n && t && (t === n || (n.length >= 8 && (t.includes(n) || n.includes(t))))) {
      list.splice(i, 1)
      continue
    }
    if (n && captionBBox && Array.isArray(it.bbox) && it.bbox.length === 4) {
      const clCap = pdfBBoxToContentList(captionBBox, pageSize)
      if (bboxIou(clCap, it.bbox as BBox) >= 0.55 && (!t || t === n || n.includes(t) || t.includes(n))) {
        list.splice(i, 1)
      }
    }
  }
}

/** Clear img_path on the matching image item; keep captions. Returns removed filename. */
function clearVisualImagePath(
  list: ContentListItem[],
  pageIndex: number,
  pdfBBox: BBox | undefined,
  pageSize: [number, number],
  parentType: string,
): string | null {
  const typ = parentType === 'table' || parentType === 'chart' ? parentType : 'image'
  const idx = findVisualItemIndex(list, pageIndex, pdfBBox, pageSize, [typ])
  if (idx < 0) return null
  const item = list[idx]
  const file = imgFileName(item.img_path)
  delete item.img_path
  if (typ === 'table') {
    delete item.table_body
  }
  const hasCap =
    (item.image_caption?.length || 0) +
      (item.image_footnote?.length || 0) +
      (item.table_caption?.length || 0) +
      (item.table_footnote?.length || 0) >
    0
  if (!hasCap && typ === 'image') {
    list.splice(idx, 1)
  } else if (!hasCap && typ === 'table' && !item.table_body) {
    list.splice(idx, 1)
  }
  return file
}

/** Remove the whole image/table content_list item tied to a visual parent. */
function removeVisualContentItem(
  list: ContentListItem[],
  pageIndex: number,
  pdfBBox: BBox | undefined,
  pageSize: [number, number],
  parentType: string,
): string | null {
  const typ = parentType === 'table' || parentType === 'chart' ? parentType : 'image'
  const idx = findVisualItemIndex(list, pageIndex, pdfBBox, pageSize, [typ])
  if (idx < 0) return null
  const removed = list.splice(idx, 1)[0]
  return imgFileName(removed?.img_path)
}

function unionBBoxes(boxes: BBox[]): BBox | undefined {
  if (!boxes.length) return undefined
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const b of boxes) {
    x0 = Math.min(x0, b[0], b[2])
    y0 = Math.min(y0, b[1], b[3])
    x1 = Math.max(x1, b[0], b[2])
    y1 = Math.max(y1, b[1], b[3])
  }
  return [x0, y0, x1, y1]
}

export const EDITABLE_TYPES = [
  'text',
  'title',
  'image_caption',
  'image_footnote',
  'image_body',
  'table_caption',
  'table_footnote',
  'table_body',
  'interline_equation',
  'list',
] as const

export type EditType = (typeof EDITABLE_TYPES)[number]

export type LayoutEditResult = {
  middle: MiddleJson
  contentList: ContentListItem[]
  /** Image filenames removed from content_list (optional disk cleanup on save). */
  removedImageFiles: string[]
}

/** Delete a layout box and sync content_list (right-panel segments). */
export function deleteLayoutBox(
  middle: MiddleJson,
  contentList: ContentListItem[],
  boxId: string,
): LayoutEditResult {
  const empty: LayoutEditResult = { middle, contentList, removedImageFiles: [] }
  const ref = parseBoxId(boxId)
  if (!ref) return empty

  const nextMiddle = cloneJson(middle)
  const nextList = cloneJson(contentList)
  const removedImageFiles: string[] = []
  const page = getPage(nextMiddle, ref.pageIndex)
  if (!page) return empty
  const blocks = getPrimaryBlocks(page)
  if (!blocks || !blocks[ref.blockIndex]) return empty

  const parent = blocks[ref.blockIndex]
  const pageSize = (page.page_size as [number, number] | undefined) ?? [612, 792]
  const parentType = parent.type || 'text'

  if (ref.childIndex != null) {
    const children = Array.isArray(parent.blocks) ? [...parent.blocks] : []
    const child = children[ref.childIndex]
    if (!child) return empty
    const childType = child.type || ''
    const childText = extractBlockText(child)
    const childBBox = Array.isArray(child.bbox) && child.bbox.length === 4 ? (child.bbox as BBox) : undefined
    const parentBBox =
      Array.isArray(parent.bbox) && parent.bbox.length === 4 ? (parent.bbox as BBox) : childBBox

    // Deleting image/table body → remove figure only; keep sibling captions in left panel
    if (/_body$/i.test(childType) || childType === 'image' || childType === 'table') {
      children.splice(ref.childIndex, 1)
      parent.blocks = children

      if (!children.length) {
        // No captions left — drop whole group
        const file = removeVisualContentItem(
          nextList,
          ref.pageIndex,
          parentBBox || childBBox,
          pageSize,
          parentType,
        )
        if (file) removedImageFiles.push(file)
        blocks.splice(ref.blockIndex, 1)
        setPrimaryBlocks(page, blocks)
      } else {
        // Keep caption/footnote children; clear img/table body from content_list
        const file = clearVisualImagePath(
          nextList,
          ref.pageIndex,
          parentBBox || childBBox,
          pageSize,
          parentType,
        )
        if (file) removedImageFiles.push(file)
        const rest = children
          .map((c) =>
            Array.isArray(c.bbox) && c.bbox.length === 4 ? (c.bbox as BBox) : null,
          )
          .filter((b): b is BBox => b != null)
        const ub = unionBBoxes(rest)
        if (ub) parent.bbox = ub
        setPrimaryBlocks(page, blocks)
      }
      return { middle: nextMiddle, contentList: nextList, removedImageFiles }
    }

    // Caption / footnote → strip from image|table item + duplicate text segments
    if (/caption|footnote/i.test(childType)) {
      removeCaptionLikeFromContentList(
        nextList,
        ref.pageIndex,
        childText,
        childBBox,
        parentBBox,
        pageSize,
        childType,
      )
      children.splice(ref.childIndex, 1)
      parent.blocks = children
      if (!children.length) {
        blocks.splice(ref.blockIndex, 1)
        setPrimaryBlocks(page, blocks)
      }
      return { middle: nextMiddle, contentList: nextList, removedImageFiles }
    }

    // Other child types
    children.splice(ref.childIndex, 1)
    parent.blocks = children
    if (childText.trim()) {
      removeCaptionLikeFromContentList(
        nextList,
        ref.pageIndex,
        childText,
        childBBox,
        parentBBox,
        pageSize,
        childType || 'image_caption',
      )
    }
    return { middle: nextMiddle, contentList: nextList, removedImageFiles }
  }

  // Top-level block
  const text = extractBlockText(parent)
  const parentBBox =
    Array.isArray(parent.bbox) && parent.bbox.length === 4 ? (parent.bbox as BBox) : undefined

  if (parentType === 'image' || parentType === 'table' || parentType === 'chart') {
    const file = removeVisualContentItem(nextList, ref.pageIndex, parentBBox, pageSize, parentType)
    if (file) removedImageFiles.push(file)
    blocks.splice(ref.blockIndex, 1)
    setPrimaryBlocks(page, blocks)
    return { middle: nextMiddle, contentList: nextList, removedImageFiles }
  }

  blocks.splice(ref.blockIndex, 1)
  setPrimaryBlocks(page, blocks)

  const ci = findContentIndexByText(nextList, ref.pageIndex, text)
  if (ci >= 0) nextList.splice(ci, 1)
  else if (parentBBox) {
    // BBox fallback for text/title
    const target = pdfBBoxToContentList(parentBBox, pageSize)
    let best = -1
    let bestScore = 0.35
    for (let i = 0; i < nextList.length; i++) {
      const it = nextList[i]
      if ((it.page_idx ?? 0) !== ref.pageIndex) continue
      if ((it.type || 'text') === 'image' || it.type === 'table') continue
      if (!Array.isArray(it.bbox) || it.bbox.length !== 4) continue
      const score = bboxIou(target, it.bbox as BBox)
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }
    if (best >= 0) nextList.splice(best, 1)
  }

  return { middle: nextMiddle, contentList: nextList, removedImageFiles }
}

/** Change box type; promotes caption→text into a top-level block when needed. */
export function setLayoutBoxType(
  middle: MiddleJson,
  contentList: ContentListItem[],
  boxId: string,
  newType: string,
): LayoutEditResult {
  const empty: LayoutEditResult = { middle, contentList, removedImageFiles: [] }
  const ref = parseBoxId(boxId)
  if (!ref) return empty

  const nextMiddle = cloneJson(middle)
  const nextList = cloneJson(contentList)
  const page = getPage(nextMiddle, ref.pageIndex)
  if (!page) return empty
  const blocks = getPrimaryBlocks(page)
  if (!blocks || !blocks[ref.blockIndex]) return empty
  const parent = blocks[ref.blockIndex]
  const pageSize = (page.page_size as [number, number] | undefined) ?? [612, 792]

  if (ref.childIndex != null) {
    const children = Array.isArray(parent.blocks) ? [...parent.blocks] : []
    const child = children[ref.childIndex]
    if (!child) return empty
    const oldType = child.type || ''
    const childText = extractBlockText(child)
    const childBBox =
      Array.isArray(child.bbox) && child.bbox.length === 4 ? (child.bbox as BBox) : undefined
    const parentBBox =
      Array.isArray(parent.bbox) && parent.bbox.length === 4 ? (parent.bbox as BBox) : childBBox

    // Promote caption/footnote → independent text block (and strip from image captions)
    if (
      (oldType.includes('caption') || oldType.includes('footnote')) &&
      (newType === 'text' || newType === 'title')
    ) {
      removeCaptionLikeFromContentList(
        nextList,
        ref.pageIndex,
        childText,
        childBBox,
        parentBBox,
        pageSize,
        oldType,
        { removeStandalone: false },
      )
      // removeCaptionLike may also drop the standalone text we are about to insert — re-add after
      children.splice(ref.childIndex, 1)
      parent.blocks = children
      const promoted: MiddleBlock = {
        type: newType === 'title' ? 'title' : 'text',
        bbox: child.bbox,
        lines: child.lines,
      }
      blocks.splice(ref.blockIndex + 1, 0, promoted)
      setPrimaryBlocks(page, blocks)

      if (childText.trim()) {
        const bbox = childBBox ? pdfBBoxToContentList(childBBox, pageSize) : undefined
        // Insert after the visual item when possible
        let insertAt = nextList.length
        const vIdx = findVisualItemIndex(
          nextList,
          ref.pageIndex,
          parentBBox,
          pageSize,
          oldType.includes('table') ? ['table'] : ['image'],
        )
        if (vIdx >= 0) insertAt = vIdx + 1
        nextList.splice(insertAt, 0, {
          type: 'text',
          text: childText,
          text_level: newType === 'title' ? 1 : undefined,
          bbox,
          page_idx: ref.pageIndex,
        })
      }
      return { middle: nextMiddle, contentList: nextList, removedImageFiles: [] }
    }

    child.type = newType
    return { middle: nextMiddle, contentList: nextList, removedImageFiles: [] }
  }

  parent.type = newType === 'title' ? 'title' : newType
  const text = extractBlockText(parent)
  const ci = findContentIndexByText(nextList, ref.pageIndex, text)
  if (ci >= 0) {
    const item = nextList[ci]
    if (newType === 'title') {
      item.type = 'text'
      item.text_level = item.text_level || 1
    } else if (newType === 'text') {
      item.type = 'text'
      delete item.text_level
    } else {
      item.type = newType
    }
  }
  return { middle: nextMiddle, contentList: nextList, removedImageFiles: [] }
}

/** Update bbox in middle + matching content_list item. */
export function setLayoutBoxBBox(
  middle: MiddleJson,
  contentList: ContentListItem[],
  boxId: string,
  bbox: BBox,
): LayoutEditResult {
  const empty: LayoutEditResult = { middle, contentList, removedImageFiles: [] }
  const ref = parseBoxId(boxId)
  if (!ref) return empty

  const nextMiddle = cloneJson(middle)
  const nextList = cloneJson(contentList)
  const page = getPage(nextMiddle, ref.pageIndex)
  if (!page) return empty
  const blocks = getPrimaryBlocks(page)
  if (!blocks || !blocks[ref.blockIndex]) return empty
  const parent = blocks[ref.blockIndex]
  const pageSize = (page.page_size as [number, number] | undefined) ?? [612, 792]
  const clBBox = pdfBBoxToContentList(bbox, pageSize)

  if (ref.childIndex != null) {
    const children = Array.isArray(parent.blocks) ? parent.blocks : []
    const child = children[ref.childIndex]
    if (!child) return empty
    child.bbox = bbox
    const childType = child.type || ''
    // image_body resize → update image content_list bbox
    if (/_body$/i.test(childType) || childType === 'image') {
      const parentBBox =
        Array.isArray(parent.bbox) && parent.bbox.length === 4 ? (parent.bbox as BBox) : bbox
      const idx = findVisualItemIndex(
        nextList,
        ref.pageIndex,
        parentBBox,
        pageSize,
        [parent.type === 'table' ? 'table' : 'image'],
      )
      if (idx >= 0) nextList[idx].bbox = clBBox
      // Keep parent bbox as union roughly
      parent.bbox = bbox
    }
  } else {
    parent.bbox = bbox
    const text = extractBlockText(parent)
    const ci = findContentIndexByText(nextList, ref.pageIndex, text)
    if (ci >= 0) nextList[ci].bbox = clBBox
    else if (parent.type === 'image' || parent.type === 'table') {
      const idx = findVisualItemIndex(nextList, ref.pageIndex, bbox, pageSize, [parent.type])
      if (idx >= 0) nextList[idx].bbox = clBBox
    }
  }

  return { middle: nextMiddle, contentList: nextList, removedImageFiles: [] }
}

export type AddLayoutBoxOptions = {
  text?: string
  /** Relative path e.g. images/edit_abc.png — required for image_body to show on the right. */
  imgPath?: string
}

/**
 * Add a new layout box. For `image_body`, creates an image parent + body child
 * and a content_list image item (with optional cropped img_path).
 *
 * Inserts by geometric reading order (same page: top→bottom / LTR band),
 * matching how MinerU flattens para_blocks → content_list → markdown.
 */
export function addLayoutBox(
  middle: MiddleJson,
  contentList: ContentListItem[],
  pageIndex: number,
  bbox: BBox,
  type: string,
  options: AddLayoutBoxOptions | string = '',
): LayoutEditResult {
  const opts: AddLayoutBoxOptions =
    typeof options === 'string' ? { text: options } : options || {}
  const text = opts.text || ''

  const nextMiddle = cloneJson(middle)
  const nextList = cloneJson(contentList)
  const page = getPage(nextMiddle, pageIndex)
  if (!page) return { middle, contentList, removedImageFiles: [] }
  const blocks = getPrimaryBlocks(page) ?? []
  const pageSize = (page.page_size as [number, number] | undefined) ?? [612, 792]
  const clBBox = pdfBBoxToContentList(bbox, pageSize)
  const blockAt = findBlockInsertIndex(blocks, bbox)
  const listAt = findContentListInsertIndex(nextList, pageIndex, clBBox)

  if (type === 'image_body' || type === 'image') {
    const block: MiddleBlock = {
      type: 'image',
      bbox,
      blocks: [{ type: 'image_body', bbox, lines: [] }],
    }
    blocks.splice(blockAt, 0, block)
    setPrimaryBlocks(page, blocks)
    nextList.splice(listAt, 0, {
      type: 'image',
      img_path: opts.imgPath || undefined,
      image_caption: [],
      image_footnote: [],
      bbox: clBBox,
      page_idx: pageIndex,
    })
    return { middle: nextMiddle, contentList: nextList, removedImageFiles: [] }
  }

  if (type === 'table_body' || type === 'table') {
    const block: MiddleBlock = {
      type: 'table',
      bbox,
      blocks: [{ type: 'table_body', bbox, lines: [] }],
    }
    blocks.splice(blockAt, 0, block)
    setPrimaryBlocks(page, blocks)
    nextList.splice(listAt, 0, {
      type: 'table',
      table_body: text || '',
      table_caption: [],
      table_footnote: [],
      bbox: clBBox,
      page_idx: pageIndex,
    })
    return { middle: nextMiddle, contentList: nextList, removedImageFiles: [] }
  }

  const block: MiddleBlock = {
    type: type === 'title' ? 'title' : type || 'text',
    bbox,
    lines: text ? [{ spans: [{ content: text, type: 'text' }] }] : [],
  }
  blocks.splice(blockAt, 0, block)
  setPrimaryBlocks(page, blocks)

  // Standalone image_caption draw → treat as text until attached to an image
  const clType =
    type === 'title'
      ? 'text'
      : type === 'image_caption' || type === 'image_footnote'
        ? 'text'
        : type || 'text'

  nextList.splice(listAt, 0, {
    type: clType,
    text: text || undefined,
    text_level: type === 'title' ? 1 : undefined,
    bbox: clBBox,
    page_idx: pageIndex,
  })

  return { middle: nextMiddle, contentList: nextList, removedImageFiles: [] }
}
