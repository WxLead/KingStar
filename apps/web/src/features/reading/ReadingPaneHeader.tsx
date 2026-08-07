/** Shared pane chrome for reading room columns. */
export default function ReadingPaneHeader({
  title,
  meta,
  actions,
}: {
  title: string
  meta?: React.ReactNode
  actions?: React.ReactNode
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
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}
