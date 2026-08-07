/** Reading-room notes persistence + export helpers (per uploadId). */

import type { JSONContent } from '@tiptap/core'
import {
  downloadTextFile,
  notesExportFilename,
  tipTapJsonToMarkdown,
} from '@/features/reading/notesExportMarkdown'

export type NoteDoc = {
  html: string
  /** TipTap JSON — preferred for Markdown export */
  json?: JSONContent
  updatedAt: number
  text?: string
}

function notesKey(uploadId: string) {
  return `start:reading-notes:${uploadId}`
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function legacyTextToHtml(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('<') && trimmed.includes('>')) return trimmed
  return trimmed
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Rough HTML → Markdown for notes that only have HTML (pre-json saves). */
function htmlToRoughMarkdown(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]+>/g, '').trim()
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const walkInline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()
    const inner = Array.from(el.childNodes).map(walkInline).join('')
    if (tag === 'strong' || tag === 'b') return `**${inner}**`
    if (tag === 'em' || tag === 'i') return `*${inner}*`
    if (tag === 's' || tag === 'del' || tag === 'strike') return `~~${inner}~~`
    if (tag === 'code') return `\`${inner}\``
    if (tag === 'a') {
      const href = el.getAttribute('href') || ''
      return href ? `[${inner}](${href})` : inner
    }
    if (tag === 'br') return '  \n'
    return inner
  }

  const blocks: string[] = []
  const push = (s: string) => {
    const t = s.trimEnd()
    if (t) blocks.push(t)
  }

  const walkBlock = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
      const level = Number(tag[1])
      push(`${'#'.repeat(level)} ${walkInline(el).trim()}`)
      return
    }
    if (tag === 'p') {
      push(walkInline(el))
      return
    }
    if (tag === 'blockquote') {
      const inner = walkInline(el).trim().split('\n').map((l) => `> ${l}`).join('\n')
      push(inner)
      return
    }
    if (tag === 'pre') {
      push(`\`\`\`\n${el.textContent || ''}\n\`\`\``)
      return
    }
    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li')
      items.forEach((li, i) => {
        const marker = tag === 'ol' ? `${i + 1}.` : '-'
        push(`${marker} ${walkInline(li).trim()}`)
      })
      return
    }
    if (tag === 'hr') {
      push('---')
      return
    }
    if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'body') {
      Array.from(el.childNodes).forEach(walkBlock)
      return
    }
    // fallback: treat as paragraph-ish
    const text = walkInline(el).trim()
    if (text) push(text)
  }

  Array.from(doc.body.childNodes).forEach(walkBlock)
  return blocks.join('\n\n').trim()
}

export function loadNoteDoc(uploadId: string): NoteDoc | null {
  try {
    const raw = localStorage.getItem(notesKey(uploadId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as NoteDoc | { id: string; text: string; updatedAt: number }[] | { text: string }
    if (Array.isArray(parsed)) {
      const html = legacyTextToHtml(parsed.map((n) => n.text).join('\n\n'))
      return html ? { html, updatedAt: Date.now() } : null
    }
    if (parsed && typeof (parsed as NoteDoc).html === 'string') {
      return parsed as NoteDoc
    }
    if (parsed && typeof (parsed as { text?: string }).text === 'string') {
      const html = legacyTextToHtml((parsed as { text: string }).text)
      return html ? { html, updatedAt: Date.now() } : null
    }
  } catch {
    /* ignore */
  }
  return null
}

export function loadNoteHtml(uploadId: string): string {
  return loadNoteDoc(uploadId)?.html || ''
}

export function saveNoteDoc(uploadId: string, html: string, json?: JSONContent) {
  const doc: NoteDoc = {
    html,
    updatedAt: Date.now(),
    ...(json ? { json } : {}),
  }
  try {
    localStorage.setItem(notesKey(uploadId), JSON.stringify(doc))
  } catch {
    /* quota / private mode */
  }
}

export function hasNotesContent(uploadId: string): boolean {
  const doc = loadNoteDoc(uploadId)
  if (!doc) return false
  const html = (doc.html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
  if (html) return true
  if (doc.json?.content?.length) return true
  return false
}

/** Build Markdown for a paper's notes. Returns empty string if none. */
export function notesToMarkdown(uploadId: string): string {
  const doc = loadNoteDoc(uploadId)
  if (!doc) return ''
  if (doc.json && Array.isArray(doc.json.content)) {
    return tipTapJsonToMarkdown(doc.json)
  }
  if (doc.html?.trim()) {
    const md = htmlToRoughMarkdown(doc.html)
    return md ? `${md}\n` : ''
  }
  return ''
}

/** Download notes as Markdown. Returns false if empty. */
export function exportNotesMarkdown(uploadId: string, filename: string): boolean {
  const md = notesToMarkdown(uploadId)
  if (!md.trim()) return false
  downloadTextFile(notesExportFilename(filename), md)
  return true
}
