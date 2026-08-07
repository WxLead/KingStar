import { mergeAttributes, Node } from '@tiptap/core'
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewContent,
  type NodeViewProps,
} from '@tiptap/react'
import { Lightbulb } from 'lucide-react'

export type CalloutTone = 'info' | 'tip' | 'warn'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    notesCallout: {
      insertNotesCallout: (attrs?: { tone?: CalloutTone }) => ReturnType
    }
  }
}

const TONE_STYLE: Record<CalloutTone, { wrap: string; icon: string }> = {
  info: {
    wrap: 'border-[#c7c9ef] bg-[#eef0fb]',
    icon: 'text-[#4f46e5]',
  },
  tip: {
    wrap: 'border-[#a7f3d0] bg-[#ecfdf5]',
    icon: 'text-[#059669]',
  },
  warn: {
    wrap: 'border-[#fcd34d] bg-[#fffbeb]',
    icon: 'text-[#d97706]',
  },
}

function CalloutView({ node, updateAttributes }: NodeViewProps) {
  const tone = (node.attrs.tone || 'info') as CalloutTone
  const style = TONE_STYLE[tone] ?? TONE_STYLE.info

  return (
    <NodeViewWrapper
      className={`notes-callout my-3 rounded-xl border px-3 py-2.5 ${style.wrap}`}
      data-tone={tone}
    >
      <div className="mb-1.5 flex items-center gap-2" contentEditable={false}>
        <Lightbulb size={14} className={style.icon} />
        <select
          value={tone}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => updateAttributes({ tone: e.target.value as CalloutTone })}
          className={`rounded-md border-0 bg-transparent text-[12px] font-semibold outline-none ${style.icon}`}
        >
          <option value="info">高亮</option>
          <option value="tip">提示</option>
          <option value="warn">注意</option>
        </select>
      </div>
      <NodeViewContent className="notes-callout-content text-[14px] leading-relaxed text-ink outline-none" />
    </NodeViewWrapper>
  )
}

export const NotesCallout = Node.create({
  name: 'notesCallout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      tone: {
        default: 'info',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-tone') || 'info',
        renderHTML: (attrs) => ({ 'data-tone': attrs.tone }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-notes-callout]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-notes-callout': '1' }), 0]
  },

  addCommands() {
    return {
      insertNotesCallout:
        (attrs) =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: this.name,
              attrs: { tone: attrs?.tone ?? 'info' },
              content: [{ type: 'paragraph' }],
            })
            .focus()
            .run(),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView)
  },
})
