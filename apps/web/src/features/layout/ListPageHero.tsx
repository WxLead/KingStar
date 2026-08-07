/** Shared atmospheric header for list pages (文献阅读 / 任务管理). */
export default function ListPageHero({
  title,
  subtitle,
  meta,
  action,
}: {
  title: string
  subtitle: string
  meta?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <header className="relative shrink-0 overflow-hidden border-b border-[#e8e9f4]">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#e9ebfb] via-[#f3f4fb] to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, #c5c8f0 0%, transparent 70%)' }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 left-10 right-10 h-px bg-gradient-to-r from-transparent via-[#d5d8ec] to-transparent"
        aria-hidden
      />

      <div className="relative flex flex-wrap items-end justify-between gap-4 px-8 pb-6 pt-8">
        <div className="min-w-0 max-w-xl">
          <h1 className="font-display text-[34px] leading-none tracking-wide text-[#4f46e5]">{title}</h1>
          <p className="mt-2.5 text-[15px] leading-relaxed text-ink-soft">{subtitle}</p>
          {meta && <div className="mt-3.5 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  )
}

export function MetaChip({
  label,
  value,
  tone = 'neutral',
  active,
  onClick,
}: {
  label: string
  value: string | number
  tone?: 'neutral' | 'accent' | 'muted'
  active?: boolean
  onClick?: () => void
}) {
  const tones = {
    neutral: 'bg-white/80 text-ink ring-[#e4e6f0]',
    accent: 'bg-[#eef0fb] text-[#4f46e5] ring-[#dfe1f4]',
    muted: 'bg-white/50 text-[#9aa0b8] ring-[#e8e9f4]',
  }
  const activeCls = 'bg-[#4f46e5] text-white ring-[#4f46e5] shadow-sm'
  const className = `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ring-1 transition ${
    active ? activeCls : tones[tone]
  } ${onClick ? 'cursor-pointer hover:opacity-90' : ''}`

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} aria-pressed={active}>
        <span className={`text-[11px] font-medium ${active ? 'opacity-90' : 'opacity-70'}`}>{label}</span>
        <span>{value}</span>
      </button>
    )
  }

  return (
    <span className={className}>
      <span className="text-[11px] font-medium opacity-70">{label}</span>
      <span>{value}</span>
    </span>
  )
}
