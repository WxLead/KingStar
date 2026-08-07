import { hasNotesContent } from '@/features/reading/notesStorage'
import { X } from 'lucide-react'

export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').trim()
  return base || filename || '未命名文献'
}

const COVER_PALETTES = [
  { from: '#1e3a5f', to: '#3d5a80', accent: '#98c1d9' },
  { from: '#2d6a4f', to: '#40916c', accent: '#b7e4c7' },
  { from: '#6d2e46', to: '#a26769', accent: '#e8d6c0' },
  { from: '#3d348b', to: '#7678ed', accent: '#f7b267' },
  { from: '#4a5568', to: '#2d3748', accent: '#e2e8f0' },
  { from: '#9c4221', to: '#c05621', accent: '#fbd38d' },
  { from: '#234e52', to: '#285e61', accent: '#9decf9' },
  { from: '#44337a', to: '#553c9a', accent: '#e9d8fd' },
]

function coverPalette(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return COVER_PALETTES[h % COVER_PALETTES.length]
}

export function BookCover({
  title,
  uploadId,
  hasZh,
  hasNotes,
  size = 'md',
}: {
  title: string
  uploadId: string
  hasZh: boolean
  hasNotes: boolean
  size?: 'sm' | 'md'
}) {
  const palette = coverPalette(uploadId + title)
  const initial = title.slice(0, 1).toUpperCase() || 'S'
  const compact = size === 'sm'

  return (
    <div
      className={`relative overflow-hidden shadow-[0_5px_14px_-8px_rgba(30,42,82,0.42)] ${
        compact ? 'aspect-[2/3] w-10 shrink-0 rounded-md' : 'aspect-[2/3] w-full rounded-md'
      }`}
      style={{
        background: `linear-gradient(155deg, ${palette.from} 0%, ${palette.to} 72%, ${palette.accent}55 100%)`,
      }}
    >
      <div
        className={`absolute inset-y-0 left-0 opacity-80 ${compact ? 'w-0.5' : 'w-1'}`}
        style={{
          background: `linear-gradient(180deg, ${palette.accent}88, transparent 40%, ${palette.accent}44)`,
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_80%_18%,rgba(255,255,255,0.2),transparent_48%)]"
        aria-hidden
      />
      {!compact ? (
        <div className="flex h-full flex-col justify-between p-1.5 pl-2.5">
          <div className="flex flex-wrap gap-0.5">
            {hasZh ? (
              <span className="rounded bg-white/20 px-1 py-px text-[8px] font-semibold text-white backdrop-blur-sm">
                译
              </span>
            ) : null}
            {hasNotes ? (
              <span className="rounded bg-white/20 px-1 py-px text-[8px] font-semibold text-white backdrop-blur-sm">
                笔
              </span>
            ) : null}
          </div>
          <div>
            <p className="font-display text-[18px] leading-none text-white/25">{initial}</p>
            <p className="mt-0.5 line-clamp-2 text-[10px] font-semibold leading-snug text-white/95">{title}</p>
          </div>
        </div>
      ) : (
        <div className="flex h-full items-end justify-center pb-1">
          <span className="font-display text-[13px] leading-none text-white/35">{initial}</span>
        </div>
      )}
    </div>
  )
}

/** Compact book row used in sidebar & bookshelf recent list. */
export function BookShelfRow({
  title,
  uploadId,
  hasZh,
  subtitle,
  meta,
  status,
  selected,
  onClick,
  onDismiss,
}: {
  title: string
  uploadId: string
  hasZh?: boolean
  subtitle?: string
  meta?: string
  status?: {
    label: string
    className: string
    busy?: boolean
    /** Cover corner indicator color */
    dotClassName?: string
  }
  selected?: boolean
  onClick: () => void
  onDismiss?: () => void
}) {
  const hasNotes = hasNotesContent(uploadId)

  return (
    <div
      className={`group relative flex w-full items-center gap-2.5 rounded-xl border px-2 py-1.5 shadow-sm transition ${
        selected
          ? 'border-[#dfe1f4] bg-white shadow-[0_8px_20px_-14px_rgba(79,70,229,0.35)]'
          : 'border-transparent bg-white/55 hover:border-[#dfe1f4] hover:bg-white hover:shadow-[0_8px_20px_-14px_rgba(79,70,229,0.35)]'
      }`}
    >
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <div className="relative shrink-0">
          <BookCover
            title={title}
            uploadId={uploadId}
            hasZh={Boolean(hasZh)}
            hasNotes={hasNotes}
            size="sm"
          />
          {status ? (
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                status.busy ? 'animate-pulse' : ''
              } ${status.dotClassName ?? 'bg-[#4f46e5]'}`}
              aria-hidden
            />
          ) : null}
        </div>
        <div className={`min-w-0 flex-1 ${onDismiss ? 'pr-5' : ''}`}>
          <p className="truncate text-[13px] font-semibold text-ink transition group-hover:text-[#4f46e5]">
            {title}
          </p>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            {status ? (
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-px text-[10px] font-semibold tracking-wide ${status.className}`}
              >
                {status.busy ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-80" aria-hidden />
                ) : null}
                {status.label}
              </span>
            ) : null}
            {subtitle ? (
              <p className="min-w-0 truncate text-[11px] text-[#9aa0b8]">{subtitle}</p>
            ) : null}
          </div>
          {meta ? <p className="mt-0.5 truncate text-[10px] text-[#b0b4c8]">{meta}</p> : null}
        </div>
      </button>

      {onDismiss ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDismiss()
          }}
          className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md text-[#9aa0b8] opacity-0 transition hover:bg-[#f3f4fb] hover:text-[#6a70a0] group-hover:opacity-100 focus:opacity-100"
          aria-label="移除记录"
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  )
}
