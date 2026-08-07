import { Extension } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type ForwardRefRenderFunction,
} from 'react'
import type { Editor, Range } from '@tiptap/core'
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code2,
  Minus,
  Type,
  Sigma,
  Lightbulb,
} from 'lucide-react'

export type SlashCommandItem = {
  title: string
  /** Pinyin / aliases shown in UI, used for filtering */
  aliases: string[]
  description: string
  icon: React.ReactNode
  command: (props: { editor: Editor; range: Range }) => void
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    title: '正文',
    aliases: ['wb', 'zw', 'text', 'paragraph', '正文'],
    description: '普通段落',
    icon: <Type size={16} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run()
    },
  },
  {
    title: '一级标题',
    aliases: ['h1', 'bt1', 'yjbt', '一级标题', 'biaoti1'],
    description: '大标题',
    icon: <Heading1 size={16} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run()
    },
  },
  {
    title: '二级标题',
    aliases: ['h2', 'bt2', 'ejbt', '二级标题', 'biaoti2'],
    description: '中标题',
    icon: <Heading2 size={16} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run()
    },
  },
  {
    title: '三级标题',
    aliases: ['h3', 'bt3', 'sjbt', '三级标题', 'biaoti3'],
    description: '小标题',
    icon: <Heading3 size={16} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run()
    },
  },
  {
    title: '无序列表',
    aliases: ['wxlb', 'ul', 'lb', 'list', '无序列表'],
    description: '圆点列表',
    icon: <List size={16} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: '有序列表',
    aliases: ['yxlb', 'ol', 'szlb', '有序列表'],
    description: '数字列表',
    icon: <ListOrdered size={16} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: '引用',
    aliases: ['yy', 'quote', 'yywz', '引用'],
    description: '引用块',
    icon: <Quote size={16} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: '代码块',
    aliases: ['dm', 'dmk', 'code', 'codeblock', '代码块'],
    description: '代码片段',
    icon: <Code2 size={16} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    title: '分割线',
    aliases: ['fgx', 'fengexian', 'hr', 'divider', '分割线'],
    description: '插入一条分割线',
    icon: <Minus size={16} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
  {
    title: '高亮块',
    aliases: ['gjk', 'gaoliang', 'callout', 'highlight', '高亮块'],
    description: '彩色提示 / 高亮区块',
    icon: <Lightbulb size={16} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertNotesCallout({ tone: 'info' }).run()
    },
  },
  {
    title: '公式',
    aliases: ['gs', 'gongshi', 'math', 'latex', '公式', 'katex'],
    description: '居中公式（也可写 $$E=mc^2$$）',
    icon: <Sigma size={16} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertNotesMath({ latex: '', display: true }).run()
    },
  },
]

function filterCommands(query: string): SlashCommandItem[] {
  const q = query.trim().toLowerCase().replace(/^\//, '')
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter((item) => {
    const hay = [item.title, item.description, ...item.aliases].join(' ').toLowerCase()
    return hay.includes(q) || item.aliases.some((a) => a.toLowerCase().startsWith(q))
  })
}

export type SlashListRef = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

type SlashListProps = {
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}

const SlashListInner: ForwardRefRenderFunction<SlashListRef, SlashListProps> = (
  { items, command },
  ref,
) => {
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    setSelected(0)
  }, [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelected((i) => (i + items.length - 1) % Math.max(items.length, 1))
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelected((i) => (i + 1) % Math.max(items.length, 1))
        return true
      }
      if (event.key === 'Enter') {
        const item = items[selected]
        if (item) command(item)
        return true
      }
      return false
    },
  }))

  if (!items.length) {
    return (
      <div className="rounded-xl border border-[#e4e6f0] bg-white px-3 py-2.5 text-[12px] text-[#9aa0b8] shadow-lg">
        无匹配命令
      </div>
    )
  }

  return (
    <div className="max-h-72 w-64 overflow-y-auto rounded-xl border border-[#e4e6f0] bg-white p-1 shadow-[0_12px_40px_-12px_rgba(30,42,82,0.28)]">
      {items.map((item, index) => (
        <button
          key={item.title}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command(item)}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
            index === selected ? 'bg-[#eef0fb] text-[#4f46e5]' : 'text-ink hover:bg-[#f5f6fb]'
          }`}
        >
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              index === selected ? 'bg-white text-[#4f46e5]' : 'bg-[#f3f4fb] text-[#6a70a0]'
            }`}
          >
            {item.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold leading-tight">{item.title}</span>
            <span className="mt-0.5 block truncate text-[11px] text-[#9aa0b8]">
              /{item.aliases[0]} · {item.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

const SlashList = forwardRef(SlashListInner)

export const NotesSlashCommands = Extension.create({
  name: 'notesSlashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor
          range: Range
          props: SlashCommandItem
        }) => {
          props.command({ editor, range })
        },
        items: ({ query }: { query: string }) => filterCommands(query),
        render: () => {
          let component: ReactRenderer<SlashListRef> | null = null
          let popup: TippyInstance[] | null = null

          return {
            onStart: (props: SuggestionProps<SlashCommandItem>) => {
              component = new ReactRenderer(SlashList, {
                props: {
                  items: props.items,
                  command: (item: SlashCommandItem) => props.command(item),
                },
                editor: props.editor,
              })

              if (!props.clientRect) return

              popup = tippy('body', {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
                offset: [0, 6],
                theme: 'notes-slash',
              })
            },

            onUpdate(props: SuggestionProps<SlashCommandItem>) {
              component?.updateProps({
                items: props.items,
                command: (item: SlashCommandItem) => props.command(item),
              })
              popup?.[0]?.setProps({
                getReferenceClientRect: props.clientRect as () => DOMRect,
              })
            },

            onKeyDown(props: SuggestionKeyDownProps) {
              if (props.event.key === 'Escape') {
                popup?.[0]?.hide()
                return true
              }
              return component?.ref?.onKeyDown(props) ?? false
            },

            onExit() {
              popup?.[0]?.destroy()
              component?.destroy()
              popup = null
              component = null
            },
          }
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})
