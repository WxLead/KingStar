/** Prepare MinerU markdown so math inside HTML tables / OCR-spaced $...$ renders. */

import katex from 'katex'

/**
 * MinerU / OCR often inserts spaces between every token inside math:
 * `$ 1 . 0 0 \pm 0 . 0 0 $` → `1.00\pm0.00`
 */
export function densifyTex(tex: string): string {
  let s = tex.trim()
  // "\ \pm" → "\pm" (stray backslash + spaces before another command)
  s = s.replace(/\\\s+(?=\\)/g, '')
  // "\ pm" / "\  pm" → "\pm"
  s = s.replace(/\\\s+([a-zA-Z]+)/g, '\\$1')
  // Spaces between digits and decimal points
  s = s.replace(/(\d)\s+\.\s*(?=\d)/g, '$1.')
  s = s.replace(/(\d)\s+(?=\d)/g, '$1')
  // Spaces around common operators / relations (keep command intact)
  s = s.replace(/\s*([=+\-*/<>])\s*/g, '$1')
  // Space before/after LaTeX commands adjacent to numbers
  s = s.replace(/(\d)\s+(?=\\)/g, '$1')
  s = s.replace(/(\\[a-zA-Z]+)\s+(?=\d)/g, '$1')
  s = s.replace(/(\\[a-zA-Z]+)\s+(?=\\)/g, '$1')
  // Collapse leftover runs of spaces inside mostly-numeric formulas
  if (!/\\text|\\mathrm|\\operatorname|\\begin/.test(s)) {
    s = s.replace(/\s+/g, '')
  } else {
    s = s.replace(/[ \t]{2,}/g, ' ')
  }
  return s
}

function renderTex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(densifyTex(tex), {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      output: 'html',
    })
  } catch {
    return displayMode ? `$$${tex}$$` : `$${tex}$`
  }
}

/** Replace $...$ / $$...$$ in a string with KaTeX HTML (skips empty). */
export function renderDollarMathToHtml(src: string): string {
  // Display math first
  let out = src.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => renderTex(tex, true))
  // Inline math — avoid matching empty or already-processed remnants
  out = out.replace(/\$(?!\$)([^$\n]+?)\$(?!\$)/g, (_m, tex: string) => {
    if (!tex.trim()) return _m
    return renderTex(tex, false)
  })
  return out
}

/**
 * Densify TeX inside still-present $ delimiters (for remark-math path on GFM tables / prose).
 */
export function densifyDollarMath(src: string): string {
  return src
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => `$$${densifyTex(tex)}$$`)
    .replace(/\$(?!\$)([^$\n]+?)\$(?!\$)/g, (_m, tex: string) => `$${densifyTex(tex)}$`)
}

/**
 * Full preprocess for ReactMarkdown:
 * 1) normalize escaped dollars
 * 2) densify OCR-spaced math (helps remark-math + KaTeX)
 * 3) pre-render $math$ inside HTML table cells (remark-math cannot see into raw HTML)
 */
export function prepareMarkdown(src: string): string {
  let s = src.replace(/\\\$/g, '$').replace(/\$\$\s*\n\s*\$\$/g, '$$$$')
  s = densifyDollarMath(s)

  // HTML tables from MinerU — render math in cells to KaTeX HTML for rehype-raw
  s = s.replace(/(<(?:td|th)\b[^>]*>)([\s\S]*?)(<\/(?:td|th)>)/gi, (_m, open, inner, close) => {
    if (!inner.includes('$')) return _m
    return open + renderDollarMathToHtml(inner) + close
  })

  return s
}
