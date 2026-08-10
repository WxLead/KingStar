import { Highlighter, MessageSquarePlus, X } from 'lucide-react'
import type { Annotation } from '@/features/reading/annotationsTypes'

export default function AnnotationSelectionToolbar({
  rect,
  onHighlight,
  onNote,
  onClose,
}: {
  rect: DOMRect
  onHighlight: () => void
  onNote: () => void
  onClose: () => void
}) {
  const top = Math.max(8, rect.top - 44)
  const left = Math.min(
    window.innerWidth - 180,
    Math.max(8, rect.left + rect.width / 2 - 80),
  )

  return (
    <div
      data-anno-toolbar
      className="fixed z-[80] flex items-center gap-0.5 rounded-xl border border-[#e4e6f0] bg-white p-1 shadow-[0_10px_30px_-12px_rgba(30,42,82,0.45)]"
      style={{ top, left }}
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        title="高亮"
        onClick={onHighlight}
        className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold text-[#6a70a0] transition hover:bg-[#fef9c3] hover:text-[#a16207]"
      >
        <Highlighter size={13} />
        高亮
      </button>
      <button
        type="button"
        title="批注"
        onClick={onNote}
        className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold text-[#6a70a0] transition hover:bg-[#eef0fb] hover:text-[#4f46e5]"
      >
        <MessageSquarePlus size={13} />
        批注
      </button>
      <button
        type="button"
        title="关闭"
        onClick={onClose}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9aa0b8] transition hover:bg-[#f3f4fb] hover:text-ink"
      >
        <X size={13} />
      </button>
    </div>
  )
}

export function AnnotationsListPanel({
  items,
  activeId,
  onJump,
  onDelete,
  onChangeNote,
}: {
  items: Annotation[]
  activeId: string | null
  onJump: (id: string) => void
  onDelete: (id: string) => void
  onChangeNote: (id: string, note: string) => void
}) {
  if (!items.length) {
    return (
      <p className="px-3 py-6 text-center text-[12px] leading-relaxed text-[#9aa0b8]">
        在 MD / 译文中选中文字，即可高亮或添加批注。
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2 p-2">
      {items.map((a) => (
        <li
          key={a.id}
          className={`rounded-xl border px-2.5 py-2 transition ${
            activeId === a.id
              ? 'border-[#c7c9ef] bg-[#eef0fb]'
              : 'border-[#eceef6] bg-white hover:border-[#dfe1f4]'
          }`}
        >
          <button
            type="button"
            onClick={() => onJump(a.id)}
            className="w-full text-left"
          >
            <div className="mb-1 flex items-center gap-1.5">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  a.color === 'green'
                    ? 'bg-emerald-400'
                    : a.color === 'blue'
                      ? 'bg-sky-400'
                      : a.color === 'pink'
                        ? 'bg-pink-400'
                        : 'bg-amber-400'
                }`}
              />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9aa0b8]">
                {a.source === 'zh' ? '译文' : 'MD'}
              </span>
            </div>
            <p className="line-clamp-3 text-[12px] leading-relaxed text-ink">{a.quote}</p>
          </button>
          <textarea
            value={a.note}
            placeholder="批注…"
            rows={2}
            onChange={(e) => onChangeNote(a.id, e.target.value)}
            className="mt-1.5 w-full resize-none rounded-lg border border-[#eceef6] bg-[#fbfbfe] px-2 py-1.5 text-[11px] text-ink outline-none placeholder:text-[#c0c4d8] focus:border-[#c7c9ef]"
          />
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onClick={() => onDelete(a.id)}
              className="text-[11px] font-semibold text-[#9aa0b8] transition hover:text-[#dc2626]"
            >
              删除
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
