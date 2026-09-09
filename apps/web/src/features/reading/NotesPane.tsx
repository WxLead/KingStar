import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import 'tippy.js/dist/tippy.css'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Undo2,
  Redo2,
  Link as LinkIcon,
  Sigma,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Baseline,
  ChevronDown,
  Heading1,
  Heading2,
  Heading3,
  Download,
  Type,
} from 'lucide-react'
import ReadingPaneHeader from '@/features/reading/ReadingPaneHeader'
import { NotesSlashCommands } from '@/features/reading/notesSlashCommands'
import { NotesMath } from '@/features/reading/notesMath'
import { NotesCallout } from '@/features/reading/notesCallout'
import { appPrompt } from '@/features/ui/app-modal'
import {
  downloadTextFile,
  notesExportFilename,
  tipTapJsonToMarkdown,
} from '@/features/reading/notesExportMarkdown'
import { saveNoteDoc, fetchNoteDoc } from '@/features/reading/notesStorage'
import {
  aiMarkdownToCalloutJSON,
  registerNotesImportHandler,
} from '@/features/reading/notesImportBridge'

const FONT_COLORS = [
  { label: '默认', value: '' },
  { label: '墨黑', value: '#1e2a52' },
  { label: '灰', value: '#6a70a0' },
  { label: '紫', value: '#4f46e5' },
  { label: '红', value: '#dc2626' },
  { label: '橙', value: '#ea580c' },
  { label: '绿', value: '#059669' },
  { label: '蓝', value: '#2563eb' },
] as const

function ToolBtn({
  active,
  disabled,
  title,
  onClick,
  children,
  className = '',
}: {
  active?: boolean
  disabled?: boolean
  title: string
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-7 items-center justify-center rounded-lg transition disabled:opacity-40 ${
        active ? 'bg-white text-[#4f46e5] shadow-sm' : 'text-[#6a70a0] hover:bg-white/80 hover:text-ink'
      } ${className || 'w-7'}`}
    >
      {children}
    </button>
  )
}

function ToolSep() {
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-[#d8dbea]" aria-hidden />
}

function useClickOutside(open: boolean, onClose: () => void) {
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, onClose])
  return rootRef
}

type MenuItem = {
  key: string
  label: string
  icon: React.ReactNode
  active?: boolean
  onSelect: () => void
}

function ToolMenu({
  title,
  active,
  trigger,
  items,
  menuClassName = 'w-40',
}: {
  title: string
  active?: boolean
  trigger: React.ReactNode
  items: MenuItem[]
  menuClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useClickOutside(open, () => setOpen(false))

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title={title}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-7 items-center gap-0.5 rounded-lg px-1.5 transition ${
          active || open
            ? 'bg-white text-[#4f46e5] shadow-sm'
            : 'text-[#6a70a0] hover:bg-white/80 hover:text-ink'
        }`}
      >
        {trigger}
        <ChevronDown size={12} className={`opacity-70 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div
          className={`absolute left-0 top-full z-30 mt-1.5 rounded-xl border border-[#e4e6f0] bg-white p-1 shadow-[0_12px_40px_-12px_rgba(30,42,82,0.28)] ${menuClassName}`}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                item.onSelect()
                setOpen(false)
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition ${
                item.active
                  ? 'bg-[#eef0fb] font-semibold text-[#4f46e5]'
                  : 'text-ink hover:bg-[#f5f6fb]'
              }`}
            >
              <span className="flex h-5 w-5 items-center justify-center text-[#6a70a0]">
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ColorPicker({
  color,
  onChange,
}: {
  color: string
  onChange: (color: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useClickOutside(open, () => setOpen(false))

  const active = Boolean(color)

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title="字体颜色"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-7 w-7 flex-col items-center justify-center rounded-lg transition ${
          active || open ? 'bg-white text-[#4f46e5] shadow-sm' : 'text-[#6a70a0] hover:bg-white/80 hover:text-ink'
        }`}
      >
        <Baseline size={13} />
        <span
          className="mt-px h-[2px] w-3.5 rounded-full"
          style={{ backgroundColor: color || '#1e2a52' }}
        />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-44 rounded-xl border border-[#e4e6f0] bg-white p-2 shadow-[0_12px_40px_-12px_rgba(30,42,82,0.28)]">
          <div className="mb-2 grid grid-cols-4 gap-1.5">
            {FONT_COLORS.map((c) => (
              <button
                key={c.label}
                type="button"
                title={c.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(c.value)
                  setOpen(false)
                }}
                className={`flex h-7 items-center justify-center rounded-md border transition ${
                  (c.value || '') === (color || '')
                    ? 'border-[#4f46e5] ring-1 ring-[#c7c9ef]'
                    : 'border-[#eceef6] hover:border-[#c7c9ef]'
                }`}
              >
                {c.value ? (
                  <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: c.value }} />
                ) : (
                  <span className="text-[10px] font-semibold text-[#9aa0b8]">A</span>
                )}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#f5f6fb] px-2 py-1.5 text-[11px] text-[#6a70a0]">
            <span>自定义</span>
            <input
              type="color"
              value={color || '#1e2a52'}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => onChange(e.target.value)}
              className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}

/** WYSIWYG notes pane — realtime rich text, stores HTML. */
export function NotesPane({
  uploadId,
  filename = 'notes',
  onCollapse,
}: {
  uploadId: string
  filename?: string
  onCollapse?: () => void
}) {
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'local'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readyRef = useRef(false)
  const uploadIdRef = useRef(uploadId)
  uploadIdRef.current = uploadId

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // # / ## / ### + 空格 → 对应级别标题（符号会被替换成标题样式，不是换行）
        heading: { levels: [1, 2, 3, 4] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-[#4f46e5] underline underline-offset-2' },
      }),
      TextStyle,
      Color,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right', 'justify'],
        defaultAlignment: 'justify',
      }),
      Placeholder.configure({
        showOnlyCurrent: true,
        includeChildren: true,
        placeholder: ({ node, editor, pos }) => {
          if (node.type.name === 'heading') {
            const level = Number(node.attrs.level) || 1
            if (level === 1) return '请输入一级标题'
            if (level === 2) return '请输入二级标题'
            if (level === 3) return '请输入三级标题'
            return '请输入标题'
          }
          if (node.type.name === 'codeBlock') return '请输入代码'
          if (node.type.name === 'paragraph') {
            // Guard: Placeholder may pass a stale pos while content is replaced
            // (e.g. AI → notes import), which would throw RangeError on resolve.
            try {
              const size = editor.state.doc.content.size
              if (pos < 0 || pos > size) {
                return editor.isEmpty ? '输入笔记，或按 / 唤起命令' : '请输入正文'
              }
              const parent = editor.state.doc.resolve(pos).parent
              if (parent.type.name === 'listItem') return '请输入列表项'
              if (parent.type.name === 'blockquote') return '请输入引用内容'
              if (parent.type.name === 'notesCallout') return '请输入高亮内容'
            } catch {
              /* ignore resolve errors */
            }
            return editor.isEmpty ? '输入笔记，或按 / 唤起命令' : '请输入正文'
          }
          return ''
        },
      }),
      NotesCallout,
      NotesMath,
      NotesSlashCommands,
    ],
    content: '',
    editorProps: {
      attributes: {
        class:
          'notes-editor md-render min-h-full px-4 py-4 text-[14px] leading-[1.75] text-ink outline-none focus:outline-none',
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (!readyRef.current) return
      const html = ed.getHTML()
      const json = ed.getJSON()
      if (saveTimer.current) clearTimeout(saveTimer.current)
      setSaveState('saving')
      saveTimer.current = setTimeout(() => {
        void (async () => {
          const result = await saveNoteDoc(uploadIdRef.current, html, json)
          setSavedAt(result.updatedAt)
          setSaveState(result.localOnly ? 'local' : 'saved')
        })()
      }, 400)
    },
  })

  useEffect(() => {
    if (!editor) return
    let cancelled = false
    readyRef.current = false

    void (async () => {
      const doc = await fetchNoteDoc(uploadId)
      if (cancelled || !editor || editor.isDestroyed) return
      const html = doc?.html || ''
      editor.commands.setContent(html || '', { emitUpdate: false })
      setSavedAt(html ? doc?.updatedAt || Date.now() : null)
      setSaveState(html ? 'saved' : 'idle')
      readyRef.current = true
    })()

    const persistNow = () => {
      if (!editor || editor.isDestroyed || !readyRef.current) return
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      void saveNoteDoc(uploadId, editor.getHTML(), editor.getJSON())
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') persistNow()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('beforeunload', persistNow)

    const unregister = registerNotesImportHandler(({ markdown, title }) => {
      try {
        if (!editor || editor.isDestroyed) return false
        const nodes = aiMarkdownToCalloutJSON(markdown, title || 'AI 摘录')
        if (!nodes.length) return false
        const doc = editor.getJSON()
        const prev = Array.isArray(doc.content) ? [...doc.content] : []
        if (prev.length) {
          const last = prev[prev.length - 1]
          if (
            last?.type === 'paragraph' &&
            (!last.content || last.content.length === 0)
          ) {
            prev.pop()
          }
        }
        editor.commands.setContent(
          { type: 'doc', content: [...prev, ...nodes] },
          { emitUpdate: true },
        )
        return true
      } catch (err) {
        console.error('[notes import]', err)
        return false
      }
    })

    return () => {
      cancelled = true
      unregister()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('beforeunload', persistNow)
      persistNow()
      readyRef.current = false
    }
  }, [editor, uploadId])

  const setLink = () => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    void (async () => {
      const url = await appPrompt({
        title: '插入链接',
        description: '留空并确定可移除当前链接。',
        defaultValue: prev || 'https://',
        placeholder: 'https://',
        confirmLabel: '应用',
        allowEmpty: true,
      })
      if (url === null) return
      if (url === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run()
        return
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    })()
  }

  const currentColor = (editor?.getAttributes('textStyle').color as string | undefined) || ''

  const headingLevel = editor?.isActive('heading', { level: 1 })
    ? 1
    : editor?.isActive('heading', { level: 2 })
      ? 2
      : editor?.isActive('heading', { level: 3 })
        ? 3
        : 0

  const align: 'left' | 'center' | 'right' | 'justify' = editor?.isActive({ textAlign: 'center' })
    ? 'center'
    : editor?.isActive({ textAlign: 'right' })
      ? 'right'
      : editor?.isActive({ textAlign: 'left' })
        ? 'left'
        : 'justify'

  const AlignIcon =
    align === 'center'
      ? AlignCenter
      : align === 'right'
        ? AlignRight
        : align === 'left'
          ? AlignLeft
          : AlignJustify

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#fafbfe]">
      <ReadingPaneHeader
        title="笔记"
        onCollapse={onCollapse}
        meta={
          saveState === 'saving'
            ? '保存中…'
            : saveState === 'local'
              ? '仅本地缓存（服务器未同步）'
              : savedAt
                ? `已保存 ${new Date(savedAt).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : '实时排版 · 自动保存'
        }
        actions={
          <button
            type="button"
            disabled={!editor}
            onClick={() => {
              if (!editor) return
              const md = tipTapJsonToMarkdown(editor.getJSON())
              downloadTextFile(notesExportFilename(filename), md || '\n')
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e6f0] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#6a70a0] transition hover:border-[#c7c9ef] hover:text-[#4f46e5] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={13} />
            导出 MD
          </button>
        }
      />

      {editor ? (
        <div className="flex h-10 shrink-0 flex-wrap items-center gap-0.5 border-b border-[#eceef6] bg-[#f3f4fb] px-2">
          <ToolBtn
            title="粗体 (Ctrl/⌘+B)"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={14} />
          </ToolBtn>
          <ToolBtn
            title="斜体 (Ctrl/⌘+I)"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={14} />
          </ToolBtn>
          <ToolBtn
            title="删除线"
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough size={14} />
          </ToolBtn>
          <ToolBtn
            title="行内代码"
            active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code size={14} />
          </ToolBtn>
          <ColorPicker
            color={currentColor}
            onChange={(c) => {
              if (!c) {
                editor.chain().focus().unsetColor().run()
                return
              }
              editor.chain().focus().setColor(c).run()
            }}
          />
          <ToolSep />
          <ToolMenu
            title="标题"
            active={headingLevel > 0}
            trigger={
              <span className="min-w-[1.6rem] text-center text-[11px] font-bold leading-none">
                {headingLevel ? `H${headingLevel}` : '正文'}
              </span>
            }
            items={[
              {
                key: 'p',
                label: '正文',
                icon: <Type size={14} />,
                active: headingLevel === 0,
                onSelect: () => editor.chain().focus().setParagraph().run(),
              },
              {
                key: 'h1',
                label: '一级标题',
                icon: <Heading1 size={14} />,
                active: headingLevel === 1,
                onSelect: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
              },
              {
                key: 'h2',
                label: '二级标题',
                icon: <Heading2 size={14} />,
                active: headingLevel === 2,
                onSelect: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
              },
              {
                key: 'h3',
                label: '三级标题',
                icon: <Heading3 size={14} />,
                active: headingLevel === 3,
                onSelect: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
              },
            ]}
          />
          <ToolBtn
            title="无序列表"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List size={14} />
          </ToolBtn>
          <ToolBtn
            title="有序列表"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={14} />
          </ToolBtn>
          <ToolBtn
            title="引用"
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote size={14} />
          </ToolBtn>
          <ToolBtn title="链接" active={editor.isActive('link')} onClick={setLink}>
            <LinkIcon size={14} />
          </ToolBtn>
          <ToolBtn
            title="公式（/gs · 默认居中）"
            active={editor.isActive('notesMath')}
            onClick={() =>
              editor.chain().focus().insertNotesMath({ latex: '', display: true }).run()
            }
          >
            <Sigma size={14} />
          </ToolBtn>
          <ToolSep />
          <ToolMenu
            title="对齐"
            active={align !== 'justify'}
            trigger={<AlignIcon size={14} />}
            menuClassName="w-36"
            items={[
              {
                key: 'justify',
                label: '两端对齐',
                icon: <AlignJustify size={14} />,
                active: align === 'justify',
                onSelect: () => editor.chain().focus().setTextAlign('justify').run(),
              },
              {
                key: 'left',
                label: '左对齐',
                icon: <AlignLeft size={14} />,
                active: align === 'left',
                onSelect: () => editor.chain().focus().setTextAlign('left').run(),
              },
              {
                key: 'center',
                label: '居中',
                icon: <AlignCenter size={14} />,
                active: align === 'center',
                onSelect: () => editor.chain().focus().setTextAlign('center').run(),
              },
              {
                key: 'right',
                label: '右对齐',
                icon: <AlignRight size={14} />,
                active: align === 'right',
                onSelect: () => editor.chain().focus().setTextAlign('right').run(),
              },
            ]}
          />
          <ToolSep />
          <ToolBtn title="撤销" onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 size={14} />
          </ToolBtn>
          <ToolBtn title="重做" onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 size={14} />
          </ToolBtn>
        </div>
      ) : null}

      <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full min-h-[12rem]" />
      </div>
    </div>
  )
}
