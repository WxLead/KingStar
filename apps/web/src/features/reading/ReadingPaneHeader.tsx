/** Shared pane chrome for reading room columns. */
import type { HTMLAttributes, ReactNode } from 'react'
import { ChevronRight, PanelLeftClose } from 'lucide-react'

export default function ReadingPaneHeader({
  title,
  meta,
  actions,
  onCollapse,
}: {
  title: string
  meta?: ReactNode
  actions?: ReactNode
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
      className="group relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden bg-[#f4f5fb] transition-colors duration-200 hover:bg-[#eef0fb]"
      aria-label={`展开${label}`}
    >
      <span
        aria-hidden
        className="absolute inset-y-3 left-1/2 w-px -translate-x-1/2 bg-[#e4e6f0] transition group-hover:bg-[#c7c9ef]"
      />
      <span className="relative z-[1] flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#8b91b3] shadow-sm ring-1 ring-[#e8e9f4] transition duration-200 group-hover:text-[#4f46e5] group-hover:ring-[#c7c9ef]">
        <ChevronRight size={15} strokeWidth={2.25} className="translate-x-px" />
      </span>
      <span
        className="relative z-[1] font-display text-[13px] font-semibold tracking-[0.28em] text-[#6a70a0] transition-colors duration-200 group-hover:text-[#4f46e5]"
        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
      >
        {label}
      </span>
    </button>
  )
}

/** Keep pane content mounted; crossfade with collapsed rail for smoother collapse. */
export function PaneFrame({
  collapsed,
  label,
  onExpand,
  children,
}: {
  collapsed: boolean
  label: string
  onExpand: () => void
  children: ReactNode
}) {
  return (
    <div className="relative h-full w-full min-w-0 overflow-hidden">
      <div
        className={`h-full w-full will-change-[opacity,transform] transition-[opacity,transform] duration-200 ease-out ${
          collapsed
            ? 'pointer-events-none invisible absolute inset-0 scale-[0.98] opacity-0'
            : 'relative opacity-100'
        }`}
        aria-hidden={collapsed}
        // When collapsed, fully disable the content subtree so it cannot steal focus/input.
        {...(collapsed ? ({ inert: true } as HTMLAttributes<HTMLDivElement>) : null)}
      >
        {children}
      </div>
      {/* Only mount the rail while collapsed — an opacity-0 overlay still intercepts clicks
          because button children default to pointer-events:auto. */}
      {collapsed ? (
        <div className="absolute inset-0 z-20">
          <CollapsedPaneRail label={label} onExpand={onExpand} />
        </div>
      ) : null}
    </div>
  )
}
