import type { ReactNode } from 'react'

/** Shared page header: theme icon tile + solid title + right actions (flat, no card). */
export default function ListPageHero({
  title,
  icon,
  meta,
  action,
}: {
  title: string
  icon: ReactNode
  meta?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="mb-5 shrink-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef0fb] text-[#4f46e5] ring-1 ring-[#dfe1f4]">
            {icon}
          </span>
          <div className="flex min-w-0 flex-col justify-center">
            <h1 className="font-display truncate text-[22px] font-semibold leading-none tracking-wide text-[#4f46e5]">
              {title}
            </h1>
            {meta ? <div className="mt-1.5 flex flex-wrap items-center gap-2">{meta}</div> : null}
          </div>
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
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
