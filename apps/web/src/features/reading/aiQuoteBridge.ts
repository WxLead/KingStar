/** Bridge: literature selection → AI composer quote chip (Ctrl+L). */

export type AiQuoteSource = 'md' | 'zh'

export type AiQuotePayload = {
  text: string
  source: AiQuoteSource
}

type AiQuoteHandler = (payload: AiQuotePayload) => void

let handler: AiQuoteHandler | null = null

export function registerAiQuoteHandler(next: AiQuoteHandler | null) {
  handler = next
  return () => {
    if (handler === next) handler = null
  }
}

/** Attach a literature excerpt to the AI composer. Returns true if accepted. */
export function attachQuoteToAi(payload: AiQuotePayload): boolean {
  const text = payload.text.replace(/\s+/g, ' ').trim().slice(0, 6_000)
  if (!text || !handler) return false
  handler({ text, source: payload.source })
  return true
}

export function quoteSourceLabel(source: AiQuoteSource): string {
  return source === 'zh' ? '译文' : 'MD'
}

/** Short preview for chip / bubble (Cursor-style ellipsis). */
export function ellipsizeQuote(text: string, max = 48): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}
