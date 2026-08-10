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

/** Common venue → short label */
const VENUE_ALIASES: Array<{ re: RegExp; abbr: string }> = [
  { re: /robotics:\s*science\s*(and|&)\s*systems|\brss\b/i, abbr: 'RSS' },
  { re: /neurips|neural information processing systems|\bnips\b/i, abbr: 'NeurIPS' },
  { re: /international conference on machine learning|\bicml\b/i, abbr: 'ICML' },
  { re: /international conference on learning representations|\biclr\b/i, abbr: 'ICLR' },
  { re: /computer vision and pattern recognition|\bcvpr\b/i, abbr: 'CVPR' },
  { re: /international conference on computer vision|\biccv\b/i, abbr: 'ICCV' },
  { re: /european conference on computer vision|\beccv\b/i, abbr: 'ECCV' },
  { re: /\baaai\b/i, abbr: 'AAAI' },
  { re: /\bijcai\b/i, abbr: 'IJCAI' },
  { re: /association for computational linguistics|\bacl\b/i, abbr: 'ACL' },
  { re: /\bemnlp\b/i, abbr: 'EMNLP' },
  { re: /\bnaacl\b/i, abbr: 'NAACL' },
  { re: /\bchi\b|human factors in computing/i, abbr: 'CHI' },
  { re: /\buist\b/i, abbr: 'UIST' },
  { re: /\bsiggraph\b/i, abbr: 'SIGGRAPH' },
  { re: /\biros\b/i, abbr: 'IROS' },
  { re: /\bicra\b/i, abbr: 'ICRA' },
  { re: /conference on robot learning|\bcorl\b/i, abbr: 'CoRL' },
  { re: /\bicoil\b|\bicoRL\b/i, abbr: 'CoRL' },
  { re: /\bnature\b/i, abbr: 'Nature' },
  { re: /\bscience\b(?!\s*and\s*systems)/i, abbr: 'Science' },
  { re: /\bcell\b/i, abbr: 'Cell' },
  { re: /proceedings of the (ieee|acm)/i, abbr: 'IEEE' },
  { re: /\barxiv\b/i, abbr: 'arXiv' },
  { re: /transactions on pattern analysis|\btpami\b/i, abbr: 'TPAMI' },
  { re: /journal of machine learning research|\bjmlr\b/i, abbr: 'JMLR' },
]

const STOP = new Set([
  'a',
  'an',
  'the',
  'of',
  'on',
  'and',
  'for',
  'in',
  'to',
  'with',
  'by',
  'at',
  'from',
  'via',
  'into',
  'international',
  'conference',
  'symposium',
  'workshop',
  'proceedings',
  'journal',
  'transactions',
  'annual',
  'ieee',
  'acm',
  'volume',
  'vol',
  'part',
])

/** Abbreviate journal / conference name for cover badge. */
export function venueAbbreviation(venue?: string | null): string | null {
  const raw = (venue || '').trim()
  if (!raw) return null

  for (const { re, abbr } of VENUE_ALIASES) {
    if (re.test(raw)) return abbr
  }

  // Already a short acronym-like token
  const compact = raw.replace(/\s+/g, '')
  if (/^[A-Za-z][A-Za-z0-9.+-]{1,7}$/.test(compact) && compact === compact.toUpperCase()) {
    return compact.slice(0, 8)
  }
  if (/^[A-Za-z]{2,8}$/.test(raw) && raw.length <= 8) {
    return raw
  }

  // Strip year / parentheses content
  let cleaned = raw
    .replace(/\(([^)]*)\)/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/[,:;|/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const words = cleaned
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9+.-]/g, ''))
    .filter((w) => w.length > 0 && !STOP.has(w.toLowerCase()))

  if (!words.length) {
    return raw.slice(0, 6)
  }

  // Prefer initials when multiple words
  if (words.length >= 2) {
    const initials = words
      .map((w) => w[0])
      .join('')
      .toUpperCase()
    if (initials.length >= 2) return initials.slice(0, 6)
  }

  // Single long word: take leading capitals or first 5–6 chars
  const one = words[0]
  const caps = one.replace(/[^A-Z]/g, '')
  if (caps.length >= 2 && caps.length <= 6) return caps
  return one.slice(0, 6)
}

/** Cover badge: venue abbr, or arXiv for preprints / arxiv_id. */
export function coverVenueLabel(
  venue?: string | null,
  opts?: { venueType?: string | null; arxivId?: string | null },
): string | null {
  const abbr = venueAbbreviation(venue)
  if (abbr) return abbr
  const arxivId = (opts?.arxivId || '').trim()
  const vt = (opts?.venueType || '').trim().toLowerCase()
  if (arxivId || vt === 'preprint') return 'arXiv'
  return null
}

export function venueTypeDisplayLabel(
  venueType?: string | null,
  arxivId?: string | null,
): string {
  const vt = (venueType || '').trim().toLowerCase()
  if (vt === 'journal') return '期刊'
  if (vt === 'conference') return '会议'
  if (vt === 'preprint' || (arxivId || '').trim()) return '预印本'
  if (vt === 'other') return '其他'
  return ''
}

function coverPalette(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return COVER_PALETTES[h % COVER_PALETTES.length]
}

export function BookCover({
  title,
  uploadId,
  venue,
  venueType,
  arxivId,
  size = 'md',
}: {
  title: string
  uploadId: string
  /** Journal / conference name — shown as abbreviation badge */
  venue?: string | null
  venueType?: string | null
  arxivId?: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const palette = coverPalette(uploadId + title)
  const initial = title.slice(0, 1).toUpperCase() || 'S'
  const compact = size === 'sm'
  const large = size === 'lg'
  const venueAbbr = coverVenueLabel(venue, { venueType, arxivId })
  const badgeTitle =
    (venue || '').trim() ||
    ((arxivId || '').trim() ? `arXiv:${(arxivId || '').trim()}` : undefined) ||
    venueAbbr

  return (
    <div
      className={`relative overflow-hidden shadow-[0_5px_14px_-8px_rgba(30,42,82,0.42)] ${
        compact
          ? 'aspect-[2/3] w-10 shrink-0 rounded-md'
          : large
            ? 'aspect-[5/7] w-full rounded-lg'
            : 'aspect-[2/3] w-full rounded-md'
      }`}
      style={{
        background: `linear-gradient(155deg, ${palette.from} 0%, ${palette.to} 72%, ${palette.accent}55 100%)`,
      }}
    >
      <div
        className={`absolute inset-y-0 left-0 opacity-80 ${compact ? 'w-0.5' : large ? 'w-1.5' : 'w-1'}`}
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
        <div
          className={`flex h-full flex-col justify-between ${
            large ? 'p-2.5 pl-3.5' : 'p-1.5 pl-2.5'
          }`}
        >
          <div className="flex flex-wrap gap-0.5">
            {venueAbbr ? (
              <span
                title={badgeTitle || venueAbbr}
                className={`max-w-full truncate rounded bg-white/20 font-semibold tracking-wide text-white backdrop-blur-sm ${
                  large ? 'px-2 py-0.5 text-[12px]' : 'px-1 py-px text-[8px]'
                }`}
              >
                {venueAbbr}
              </span>
            ) : null}
          </div>
          <div>
            <p
              className={`font-display leading-none text-white/25 ${
                large ? 'text-[32px]' : 'text-[18px]'
              }`}
            >
              {initial}
            </p>
            <p
              className={`mt-1 line-clamp-2 font-semibold leading-snug text-white/95 ${
                large ? 'text-[14px]' : 'text-[10px]'
              }`}
            >
              {title}
            </p>
          </div>
        </div>
      ) : (
        <div className="relative flex h-full flex-col">
          {venueAbbr ? (
            <span
              title={badgeTitle || venueAbbr}
              className="absolute left-0.5 top-0.5 max-w-[calc(100%-4px)] truncate rounded bg-black/25 px-0.5 text-[7px] font-bold leading-tight tracking-wide text-white/95"
            >
              {venueAbbr}
            </span>
          ) : null}
          <div className="mt-auto flex items-end justify-center pb-1">
            <span className="font-display text-[13px] leading-none text-white/35">{initial}</span>
          </div>
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
  hasNotes = false,
  venue,
  venueType,
  arxivId,
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
  hasNotes?: boolean
  venue?: string | null
  venueType?: string | null
  arxivId?: string | null
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
            venue={venue}
            venueType={venueType}
            arxivId={arxivId}
            size="sm"
          />
          {status ? (
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                status.dotClassName || 'bg-[#4f46e5]'
              } ${status.busy ? 'animate-pulse' : ''}`}
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink">{title}</p>
          {subtitle ? <p className="mt-0.5 truncate text-[11px] text-[#9aa0b8]">{subtitle}</p> : null}
          {meta ? <p className="mt-0.5 truncate text-[11px] text-[#9aa0b8]">{meta}</p> : null}
          {status ? (
            <span
              className={`mt-1 inline-flex rounded-full px-1.5 py-px text-[10px] font-semibold ${status.className}`}
            >
              {status.label}
            </span>
          ) : null}
          {!meta && (hasZh || hasNotes) ? (
            <p className="mt-0.5 truncate text-[11px] text-[#9aa0b8]">
              {hasZh ? '原文 · 译文' : '原文'}
              {hasNotes ? ' · 笔记' : ''}
            </p>
          ) : null}
        </div>
      </button>
      {onDismiss ? (
        <button
          type="button"
          title="从列表移除"
          onClick={(e) => {
            e.stopPropagation()
            onDismiss()
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#b0b5c9] opacity-0 transition hover:bg-[#f3f4fb] hover:text-[#6a70a0] group-hover:opacity-100"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  )
}
