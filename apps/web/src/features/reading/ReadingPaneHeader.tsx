/** Shared pane chrome for reading room columns. */
import { PanelLeftClose } from 'lucide-react'

export default function ReadingPaneHeader({
  title,
  meta,
  actions,
  onCollapse,
}: {
  title: string
  meta?: React.ReactNode
  actions?: React.ReactNode
  /** Collapse this reading-room column */
  onCollapse?: () => void
}) {
  return (
    <div className="relative flex h-14 shrink-0 items-center justify-between gap-3 overflow-hidden border-b border-[#eceef6] bg-gradient-to-b from-white to-[#f7f8fc] px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-[#6366f1] via-[#4f46e5] to-[#7c3aed]"
      />
      <div className="flex min-w-0 items-baseline gap-2.5 pl-1.5">
        <span className="font-display truncate text-[18px] leading-none tracking-wide text-[#1e2a52]">
          {title}
        </span>
        {meta ? (
          <span className="hidden truncate text-[12px] leading-none text-[#9aa0b8] xl:inline">
            {meta}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {actions}
        {onCollapse ? (
          <button
            type="button"
            onClick={onCollapse}
            aria-label={`折叠${title}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8b91b3] transition hover:bg-[#eef0fb] hover:text-[#4f46e5]"
          >
            <PanelLeftClose size={15} />
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** Narrow vertical rail when a reading column is collapsed. */
export function CollapsedPaneRail({
  label,
  onExpand,
}: {
  label: string
  onExpand: () => void
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="group flex h-full w-full min-w-[44px] flex-col items-center gap-3 overflow-hidden border-r border-[#e8e9f4] bg-gradient-to-b from-white to-[#f3f4fb] py-4 transition hover:bg-[#eef0fb]"
      aria-label={`展开${label}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#eef0fb] text-[#4f46e5] transition group-hover:bg-[#4f46e5] group-hover:text-white">
        <PanelLeftClose size={14} className="rotate-180" />
      </span>
      <span
        className="font-display shrink-0 text-[14px] font-semibold tracking-wide text-[#4a5080] group-hover:text-[#4f46e5]"
        style={{ writingMode: 'vertical-rl' }}
      >
        {label}
      </span>
    </button>
  )
}
