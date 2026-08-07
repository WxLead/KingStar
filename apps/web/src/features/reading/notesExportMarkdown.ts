import type { JSONContent } from '@tiptap/core'

const CALLOUT_LABEL: Record<string, string> = {
  info: '高亮',
  tip: '提示',
  warn: '注意',
}

function escapeMd(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-.!|])/g, '\\$1')
}

function applyMarks(text: string, marks?: JSONContent['marks']): string {
  if (!text) return ''
  const hasCode = marks?.some((m) => m.type === 'code')
  let out = hasCode ? text.replace(/`/g, '\\`') : escapeMd(text)

  if (!marks?.length) return out

  if (hasCode) out = `\`${out}\``
  for (const m of marks) {
    if (m.type === 'bold') out = `**${out}**`
    if (m.type === 'italic') out = `*${out}*`
    if (m.type === 'strike') out = `~~${out}~~`
  }
  for (const m of marks) {
    if (m.type === 'link') {
      const href = String(m.attrs?.href || '').trim()
      if (href) out = `[${out}](${href})`
    }
  }
  return out
}

function inlineToMd(nodes: JSONContent[] | undefined): string {
  if (!nodes?.length) return ''
  let out = ''
  for (const n of nodes) {
    switch (n.type) {
      case 'text':
        out += applyMarks(n.text || '', n.marks)
        break
      case 'hardBreak':
        out += '  \n'
        break
      case 'notesMath': {
        const latex = String(n.attrs?.latex || '').trim()
        const display = Boolean(n.attrs?.display)
        if (!latex) break
        out += display ? `\n$$\n${latex}\n$$\n` : `$${latex}$`
        break
      }
      default:
        if (n.content) out += inlineToMd(n.content)
        break
    }
  }
  return out
}

function blockToMd(node: JSONContent, listIndent = 0): string {
  const indent = '  '.repeat(listIndent)

  switch (node.type) {
    case 'doc':
      return (node.content || []).map((c) => blockToMd(c)).filter(Boolean).join('\n\n')

    case 'paragraph': {
      const text = inlineToMd(node.content).trimEnd()
      return text ? `${indent}${text}` : ''
    }

    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1))
      const text = inlineToMd(node.content).trim()
      return `${'#'.repeat(level)} ${text}`
    }

    case 'bulletList':
      return (node.content || [])
        .map((item) => listItemToMd(item, false, listIndent))
        .filter(Boolean)
        .join('\n')

    case 'orderedList': {
      const start = Number(node.attrs?.start) || 1
      return (node.content || [])
        .map((item, i) => listItemToMd(item, true, listIndent, start + i))
        .filter(Boolean)
        .join('\n')
    }

    case 'blockquote': {
      const inner = (node.content || []).map((c) => blockToMd(c)).filter(Boolean).join('\n\n')
      return inner
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    }

    case 'codeBlock': {
      const lang = String(node.attrs?.language || '')
      const code = (node.content || []).map((c) => c.text || '').join('')
      return `\`\`\`${lang}\n${code}\n\`\`\``
    }

    case 'horizontalRule':
      return '---'

    case 'notesCallout': {
      const tone = String(node.attrs?.tone || 'info')
      const label = CALLOUT_LABEL[tone] || '高亮'
      const body = (node.content || []).map((c) => blockToMd(c)).filter(Boolean).join('\n\n')
      const quoted = body
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
      return `> **${label}**\n${quoted || '> '}`
    }

    case 'notesMath': {
      const latex = String(node.attrs?.latex || '').trim()
      if (!latex) return ''
      return Boolean(node.attrs?.display) ? `$$\n${latex}\n$$` : `$${latex}$`
    }

    default:
      if (node.content) {
        return node.content.map((c) => blockToMd(c, listIndent)).filter(Boolean).join('\n\n')
      }
      return ''
  }
}

function listItemToMd(
  item: JSONContent,
  ordered: boolean,
  indentLevel: number,
  index = 1,
): string {
  const indent = '  '.repeat(indentLevel)
  const marker = ordered ? `${index}.` : '-'
  const children = item.content || []
  if (!children.length) return `${indent}${marker} `

  const lines: string[] = []
  children.forEach((child, i) => {
    if (child.type === 'bulletList' || child.type === 'orderedList') {
      lines.push(blockToMd(child, indentLevel + 1))
      return
    }
    const chunk = blockToMd(child, 0).trim()
    if (!chunk) return
    if (i === 0) {
      const [first, ...rest] = chunk.split('\n')
      lines.push(`${indent}${marker} ${first}`)
      for (const r of rest) lines.push(`${indent}  ${r}`)
    } else {
      for (const r of chunk.split('\n')) lines.push(`${indent}  ${r}`)
    }
  })
  return lines.join('\n')
}

/** Convert TipTap JSON document to Markdown. */
export function tipTapJsonToMarkdown(doc: JSONContent): string {
  const md = blockToMd(doc).replace(/\n{3,}/g, '\n\n').trim()
  return md ? `${md}\n` : ''
}

export function downloadTextFile(filename: string, content: string, mime = 'text/markdown;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function notesExportFilename(sourceName: string): string {
  const base = sourceName.replace(/\.[^.]+$/, '').trim() || 'notes'
  const safe = base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80)
  return `${safe}-笔记.md`
}
