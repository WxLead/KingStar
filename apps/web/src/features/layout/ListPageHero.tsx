import {
  pageToolbarInner,
  toolbarSurface,
} from '@/features/layout/toolbarChrome'

/** Compact toolbar header for list pages (文献 / 任务管理 / 设置). */
export default function ListPageHero({
  title,
  subtitle,
  meta,
  action,
}: {
  title: string
  subtitle?: string
  meta?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <header className={toolbarSurface}>
      <div className={pageToolbarInner}>
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h1 className="font-display truncate text-[18px] font-semibold leading-none tracking-wide text-[#4f46e5]">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-[13px] text-ink-soft">{subtitle}</p>
          ) : null}
          {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
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
