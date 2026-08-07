import { mergeAttributes, Node, nodeInputRule } from '@tiptap/core'
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Mapping } from '@tiptap/pm/transform'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useState } from 'react'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    notesMath: {
      insertNotesMath: (attrs?: { latex?: string; display?: boolean }) => ReturnType
    }
  }
}

function MathView({ node, updateAttributes, selected }: NodeViewProps) {
  const latex = String(node.attrs.latex || '')
  const display = Boolean(node.attrs.display)
  const [editing, setEditing] = useState(!latex)
  const [draft, setDraft] = useState(latex)

  let html = ''
  try {
    html = katex.renderToString(latex, {
      throwOnError: false,
      displayMode: display,
      strict: 'ignore',
    })
  } catch {
    html = ''
  }

  if (editing) {
    return (
      <NodeViewWrapper
        as="span"
        className={`inline-flex max-w-full items-center gap-1 rounded-lg border px-1.5 py-1 ${
          selected ? 'border-[#4f46e5] bg-[#eef0fb]' : 'border-[#e4e6f0] bg-white'
        }`}
        contentEditable={false}
      >
        <input
          value={draft}
          autoFocus
          placeholder="输入 LaTeX，如 E=mc^2"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              updateAttributes({ latex: draft.trim() || 'E=mc^2' })
              setEditing(false)
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setDraft(latex)
              setEditing(false)
            }
          }}
          onBlur={() => {
            updateAttributes({ latex: draft.trim() || latex || 'E=mc^2' })
            setEditing(false)
          }}
          className="min-w-[10rem] flex-1 border-0 bg-transparent px-1 font-mono text-[13px] text-ink outline-none"
        />
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper
      as="span"
      className={`notes-math cursor-pointer rounded-md px-1 py-0.5 ${
        display ? 'my-2 inline-block w-full overflow-x-auto text-center' : 'inline-block align-middle'
      } ${selected ? 'ring-2 ring-[#c7c9ef]' : 'hover:bg-[#f3f4fb]'}`}
      contentEditable={false}
      onClick={() => {
        setDraft(latex)
        setEditing(true)
      }}
    >
      {html ? (
        <span dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <span className="font-mono text-[12px] text-[#9aa0b8]">$空公式$</span>
      )}
    </NodeViewWrapper>
  )
}

function textblockPosAt(doc: ProseMirrorNode, pos: number): number | null {
  const $pos = doc.resolve(pos)
  for (let d = $pos.depth; d > 0; d -= 1) {
    if ($pos.node(d).isTextblock) return $pos.before(d)
  }
  return null
}

function blockHasDisplayMath(block: ProseMirrorNode, mathName: string): boolean {
  let found = false
  block.descendants((n) => {
    if (n.type.name === mathName && n.attrs.display) {
      found = true
      return false
    }
  })
  return found
}

export const NotesMath = Node.create({
  name: 'notesMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      latex: { default: '' },
      display: { default: true },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-notes-math]',
        getAttrs: (el) => {
          const element = el as HTMLElement
          return {
            latex: element.getAttribute('data-latex') || '',
            display: element.getAttribute('data-display') === 'true',
          }
        },
      },
    ]
  },

  renderHTML({ node }) {
    return [
      'span',
      mergeAttributes({
        'data-notes-math': '1',
        'data-latex': node.attrs.latex,
        'data-display': String(Boolean(node.attrs.display)),
      }),
    ]
  },

  addCommands() {
    return {
      insertNotesMath:
        (attrs) =>
        ({ chain }) => {
          const display = attrs?.display ?? true
          const next = chain().insertContent({
            type: this.name,
            attrs: {
              latex: attrs?.latex || '',
              display,
            },
          })
          // 块级公式：段落临时居中；删掉后由 plugin 恢复两端对齐
          if (display) next.setTextAlign('center')
          return next.run()
        },
    }
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: /\$\$([^$]+)\$\$$/,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1], display: true }),
      }),
      nodeInputRule({
        find: /(?<!\$)\$([^$\n]+)\$$/,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1], display: false }),
      }),
    ]
  },

  addProseMirrorPlugins() {
    const mathName = this.name
    return [
      new Plugin({
        key: new PluginKey('notesMathAlign'),
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null

          const mapping = new Mapping()
          for (const tr of transactions) mapping.appendMapping(tr.mapping)

          const centerBlocks = new Set<number>()
          const restoreBlocks = new Set<number>()

          // 新文档里：含块级公式的段落 → 居中
          newState.doc.descendants((node, pos) => {
            if (node.type.name !== mathName || !node.attrs.display) return
            const blockPos = textblockPosAt(newState.doc, pos)
            if (blockPos != null) centerBlocks.add(blockPos)
          })

          // 旧文档里：块级公式被删光的段落 → 两端对齐
          oldState.doc.descendants((node, pos) => {
            if (node.type.name !== mathName || !node.attrs.display) return
            const oldBlockPos = textblockPosAt(oldState.doc, pos)
            if (oldBlockPos == null) return

            const mappedMath = mapping.mapResult(pos)
            const mathGone =
              mappedMath.deleted || newState.doc.nodeAt(mappedMath.pos)?.type.name !== mathName
            if (!mathGone) return

            const mappedBlock = mapping.mapResult(oldBlockPos)
            if (mappedBlock.deleted) return
            const newBlock = newState.doc.nodeAt(mappedBlock.pos)
            if (!newBlock?.isTextblock) return
            if (!blockHasDisplayMath(newBlock, mathName)) {
              restoreBlocks.add(mappedBlock.pos)
            }
          })

          let tr = newState.tr
          let changed = false

          for (const pos of centerBlocks) {
            const node = tr.doc.nodeAt(pos)
            if (!node?.attrs || node.attrs.textAlign === 'center') continue
            tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, textAlign: 'center' })
            changed = true
          }

          for (const pos of restoreBlocks) {
            if (centerBlocks.has(pos)) continue
            const node = tr.doc.nodeAt(pos)
            if (!node?.attrs || node.attrs.textAlign === 'justify') continue
            tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, textAlign: 'justify' })
            changed = true
          }

          return changed ? tr : null
        },
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathView)
  },
})
