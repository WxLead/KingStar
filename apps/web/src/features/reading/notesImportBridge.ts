/** Bridge: AI pane → notes editor import (same reading room). */

import type { JSONContent } from '@tiptap/core'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { prepareAiChatMarkdown } from '@/features/parse/markdownMath'

export type NotesImportPayload = {
  title?: string
  markdown: string
}

type NotesImportHandler = (payload: NotesImportPayload) => boolean

let handler: NotesImportHandler | null = null

export function registerNotesImportHandler(next: NotesImportHandler | null) {
  handler = next
  return () => {
    if (handler === next) handler = null
  }
}

/** Returns true if notes editor accepted the import. */
export function importMarkdownToNotes(payload: NotesImportPayload): boolean {
  if (!handler) return false
  return handler(payload)
}

type MdastNode = {
  type: string
  value?: string
  depth?: number
  ordered?: boolean
  url?: string
  title?: string | null
  alt?: string | null
  lang?: string | null
  children?: MdastNode[]
}

function textNode(text: string, marks?: JSONContent['marks']): JSONContent | null {
  if (!text) return null
  const node: JSONContent = { type: 'text', text }
  if (marks?.length) node.marks = marks
  return node
}

function mergeMarks(
  base: JSONContent['marks'] | undefined,
  extra: NonNullable<JSONContent['marks']>[number],
): JSONContent['marks'] {
  return [...(base || []), extra]
}

function inlineToTipTap(
  nodes: MdastNode[] | undefined,
  marks?: JSONContent['marks'],
): JSONContent[] {
  if (!nodes?.length) return []
  const out: JSONContent[] = []

  for (const n of nodes) {
    switch (n.type) {
      case 'text': {
        const t = textNode(n.value || '', marks)
        if (t) out.push(t)
        break
      }
      case 'strong':
        out.push(...inlineToTipTap(n.children, mergeMarks(marks, { type: 'bold' })))
        break
      case 'emphasis':
        out.push(...inlineToTipTap(n.children, mergeMarks(marks, { type: 'italic' })))
        break
      case 'delete':
        out.push(...inlineToTipTap(n.children, mergeMarks(marks, { type: 'strike' })))
        break
      case 'inlineCode': {
        const t = textNode(n.value || '', mergeMarks(marks, { type: 'code' }))
        if (t) out.push(t)
        break
      }
      case 'link': {
        const href = n.url || ''
        out.push(
          ...inlineToTipTap(
            n.children,
            mergeMarks(marks, { type: 'link', attrs: { href } }),
          ),
        )
        break
      }
      case 'inlineMath': {
        out.push({
          type: 'notesMath',
          attrs: { latex: (n.value || '').trim(), display: false },
        })
        break
      }
      case 'break':
        out.push({ type: 'hardBreak' })
        break
      default:
        if (n.children?.length) out.push(...inlineToTipTap(n.children, marks))
        else if (n.value) {
          const t = textNode(n.value, marks)
          if (t) out.push(t)
        }
        break
    }
  }

  return out
}

function paragraphFromInlines(inlines: JSONContent[], attrs?: Record<string, unknown>): JSONContent {
  return {
    type: 'paragraph',
    attrs: attrs || undefined,
    content: inlines.length ? inlines : undefined,
  }
}

function blockToTipTap(node: MdastNode): JSONContent[] {
  switch (node.type) {
    case 'paragraph': {
      const inlines = inlineToTipTap(node.children)
      // Display math alone in a paragraph → centered block math
      if (
        inlines.length === 1 &&
        inlines[0]?.type === 'notesMath' &&
        inlines[0].attrs?.display
      ) {
        return [
          paragraphFromInlines(inlines, { textAlign: 'center' }),
        ]
      }
      return [paragraphFromInlines(inlines)]
    }
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(node.depth) || 1)) as 1 | 2 | 3
      const inlines = inlineToTipTap(node.children)
      return [
        {
          type: 'heading',
          attrs: { level },
          content: inlines.length ? inlines : undefined,
        },
      ]
    }
    case 'blockquote': {
      const inner = (node.children || []).flatMap(blockToTipTap)
      return [
        {
          type: 'blockquote',
          content: inner.length ? inner : [{ type: 'paragraph' }],
        },
      ]
    }
    case 'code': {
      const value = node.value || ''
      return [
        {
          type: 'codeBlock',
          content: value ? [{ type: 'text', text: value }] : undefined,
        },
      ]
    }
    case 'math': {
      // Display math from remark-math
      return [
        paragraphFromInlines(
          [
            {
              type: 'notesMath',
              attrs: { latex: (node.value || '').trim(), display: true },
            },
          ],
          { textAlign: 'center' },
        ),
      ]
    }
    case 'list': {
      const ordered = Boolean(node.ordered)
      const items = (node.children || [])
        .filter((c) => c.type === 'listItem')
        .map((item) => {
          const content = (item.children || []).flatMap(blockToTipTap)
          return {
            type: 'listItem',
            content: content.length ? content : [{ type: 'paragraph' }],
          }
        })
      return [
        {
          type: ordered ? 'orderedList' : 'bulletList',
          content: items.length ? items : [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
        },
      ]
    }
    case 'thematicBreak':
      return [{ type: 'horizontalRule' }]
    case 'table': {
      // Flatten tables to paragraphs for TipTap (no table extension)
      const rows = node.children || []
      const lines: string[] = []
      for (const row of rows) {
        const cells = (row.children || []).map((cell) => {
          const text = collectText(cell).trim()
          return text
        })
        lines.push(cells.join(' | '))
      }
      return lines.map((line) => paragraphFromInlines([{ type: 'text', text: line }]))
    }
    default:
      if (node.children?.length) return node.children.flatMap(blockToTipTap)
      return []
  }
}

function collectText(node: MdastNode): string {
  if (node.value) return node.value
  return (node.children || []).map(collectText).join('')
}

function markdownToTipTapBlocks(markdown: string): JSONContent[] {
  const prepared = prepareAiChatMarkdown(markdown.trim())
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .parse(prepared) as MdastNode

  const blocks = (tree.children || []).flatMap(blockToTipTap)
  return blocks.length ? blocks : [{ type: 'paragraph' }]
}

/** Build TipTap JSON for a callout wrapping rendered AI markdown. */
export function aiMarkdownToCalloutJSON(
  markdown: string,
  title = 'AI 摘录',
): JSONContent[] {
  const raw = markdown.trim()
  if (!raw) return []

  const body = markdownToTipTapBlocks(raw)
  const inner: JSONContent[] = [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: title, marks: [{ type: 'bold' }] }],
    },
    ...body,
  ]

  return [
    {
      type: 'notesCallout',
      attrs: { tone: 'info' },
      content: inner,
    },
    { type: 'paragraph' },
  ]
}
