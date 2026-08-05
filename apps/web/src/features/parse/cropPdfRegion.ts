/** Crop a PDF page region (PDF-space bbox) to a PNG blob via pdf.js. */

import type { BBox } from '@/features/parse/middleTypes'

/**
 * Render `pageIndex` (0-based) at a moderate scale and crop `bbox` (PDF user units).
 */
export async function cropPdfPageRegion(
  pdfBlob: Blob,
  pageIndex: number,
  bbox: BBox,
  opts?: { scale?: number },
): Promise<Blob> {
  const scale = opts?.scale ?? 2.5
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const data = await pdfBlob.arrayBuffer()
  const doc = await pdfjs.getDocument({ data }).promise
  try {
    const page = await doc.getPage(pageIndex + 1)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('无法创建画布')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({
      canvasContext: ctx,
      viewport,
      intent: 'display',
      background: 'rgb(255,255,255)',
    }).promise

    const [x0, y0, x1, y1] = bbox
    const left = Math.min(x0, x1) * scale
    const top = Math.min(y0, y1) * scale
    const w = Math.abs(x1 - x0) * scale
    const h = Math.abs(y1 - y0) * scale

    const sx = Math.max(0, Math.floor(left))
    const sy = Math.max(0, Math.floor(top))
    const sw = Math.max(1, Math.min(Math.ceil(w), canvas.width - sx))
    const sh = Math.max(1, Math.min(Math.ceil(h), canvas.height - sy))

    const out = document.createElement('canvas')
    out.width = sw
    out.height = sh
    const octx = out.getContext('2d')
    if (!octx) throw new Error('无法创建裁切画布')
    octx.fillStyle = '#ffffff'
    octx.fillRect(0, 0, sw, sh)
    octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh)

    return await new Promise<Blob>((resolve, reject) => {
      out.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('PNG 编码失败'))),
        'image/png',
      )
    })
  } finally {
    await doc.destroy().catch(() => undefined)
  }
}
