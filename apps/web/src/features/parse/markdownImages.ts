/** Resolve MinerU relative image paths to BFF-served URLs. */
export function rewriteMarkdownImageSrc(
  src: string | undefined,
  taskId: string | null | undefined,
): string | undefined {
  if (!src) return src
  if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/api/')) {
    return src
  }
  if (!taskId) return src
  const normalized = src.replace(/\\/g, '/').replace(/^\.\//, '')
  const m = normalized.match(/^(?:images\/)?([^/]+\.(?:jpg|jpeg|png|gif|webp))$/i)
  if (m) {
    return `/api/v1/tasks/${encodeURIComponent(taskId)}/images/${encodeURIComponent(m[1])}`
  }
  const underImages = normalized.match(/^images\/(.+)$/i)
  if (underImages) {
    return `/api/v1/tasks/${encodeURIComponent(taskId)}/images/${encodeURIComponent(underImages[1])}`
  }
  return src
}
