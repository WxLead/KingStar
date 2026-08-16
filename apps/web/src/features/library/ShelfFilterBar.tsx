import { forwardRef, useEffect, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import {
  Check,
  ChevronDown,
  Filter,
  Layers,
  RotateCcw,
  Search,
  Tags,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { UploadItem } from '@/services/api'
import { ARRANGE_OPTIONS, paperVenueType, paperYear, type ShelfArrange } from '@/features/library/shelfArrange'

export type ShelfFilters = {
  tags: string[]
  venueTypes: string[]
  years: number[]
}

export const EMPTY_SHELF_FILTERS: ShelfFilters = {
  tags: [],
  venueTypes: [],
  years: [],
}

const VENUE_TYPE_LABEL: Record<string, string> = {
  journal: '期刊',
  conference: '会议',
  preprint: '预印本',
  other: '其他',
}

export function shelfFiltersActive(f: ShelfFilters): boolean {
  return f.tags.length > 0 || f.venueTypes.length > 0 || f.years.length > 0
}

export function applyShelfFilters(items: UploadItem[], f: ShelfFilters): UploadItem[] {
  return items.filter((item) => {
    if (f.venueTypes.length > 0) {
      const vt = paperVenueType(item)
      const norm = vt === 'unknown' ? 'other' : vt
      if (!f.venueTypes.includes(norm)) return false
    }
    if (f.years.length > 0) {
      const y = paperYear(item)
      if (y == null || !f.years.includes(y)) return false
    }
    if (f.tags.length > 0) {
      const tags = (item.tags || []).map((t) => t.toLowerCase())
      if (!f.tags.every((t) => tags.includes(t.toLowerCase()))) return false
    }
    return true
  })
}

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

const chipBase =
  'inline-flex h-[30px] items-center gap-1.5 rounded-[10px] px-2.5 text-[12px] font-semibold tracking-wide transition duration-150'

type MenuTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  icon?: ReactNode
  count?: number
  open: boolean
  marked?: boolean
}

const MenuTrigger = forwardRef<HTMLButtonElement, MenuTriggerProps>(
  function MenuTrigger(
    { label, icon, count, open, marked, className, type = 'button', ...props },
    ref,
  ) {
    const active = Boolean(count) || Boolean(marked) || open
    return (
      <button
        ref={ref}
        type={type}
        aria-expanded={open}
        className={cn(
          chipBase,
          active
            ? 'bg-[#4f46e5] text-white shadow-[0_4px_12px_-4px_rgba(79,70,229,0.55)]'
            : 'bg-white text-[#5a6086] ring-1 ring-[#e3e6f3] hover:bg-[#f7f8fd] hover:text-[#4f46e5] hover:ring-[#cfd3ef]',
          open && !count && !marked ? 'ring-2 ring-[#c7caf0]' : null,
          className,
        )}
        {...props}
      >
        {icon ? <span className="opacity-80">{icon}</span> : null}
        <span>{label}</span>
        {count ? (
          <span
            className={cn(
              'min-w-[16px] rounded-md px-1 py-px text-center text-[10px] font-bold tabular-nums leading-none',
              active ? 'bg-white/20 text-white' : 'bg-[#eef0fb] text-[#4f46e5]',
            )}
          >
            {count}
          </span>
        ) : null}
        <ChevronDown
          size={12}
          className={cn('opacity-60 transition duration-200', open && 'rotate-180')}
        />
      </button>
    )
  },
)

function OptionRow({
  label,
  hint,
  checked,
  onToggle,
}: {
  label: string
  hint?: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        onToggle()
      }}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-left transition',
        checked ? 'bg-[#f3f4fc]' : 'hover:bg-[#f8f9fd]',
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition',
          checked
            ? 'border-[#4f46e5] bg-[#4f46e5] text-white'
            : 'border-[#d7dae9] bg-white text-transparent',
        )}
      >
        <Check size={10} strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#2f3358]">{label}</span>
      {hint ? (
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-[#9aa0b8]">{hint}</span>
      ) : null}
    </button>
  )
}

function MenuHeader({
  title,
  onReset,
  canReset,
}: {
  title: string
  onReset?: () => void
  canReset?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5 border-b border-[#eef0f6] px-3.5 py-2.5">
      <Filter size={12} className="text-[#4f46e5]" />
      <p className="min-w-0 flex-1 text-[12px] font-bold tracking-wide text-[#4a5078]">{title}</p>
      {onReset ? (
        <button
          type="button"
          title="重置筛选"
          aria-label="重置筛选"
          disabled={!canReset}
          onClick={onReset}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-md transition',
            canReset
              ? 'text-[#6a70a0] hover:bg-[#f3f4fc] hover:text-[#4f46e5]'
              : 'cursor-default text-[#c5c9de]',
          )}
        >
          <RotateCcw size={12} />
        </button>
      ) : null}
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="px-3.5 pb-1 pt-2.5 text-[11px] font-bold tracking-wide text-[#9aa0b8]">{children}</p>
  )
}

const panelClass =
  'z-[200] w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#e2e5f2] bg-white p-0 text-[#2f3358] shadow-[0_20px_48px_-20px_rgba(35,42,90,0.42)]'

function CombinedFilterPanel({
  facets,
  filters,
  onChange,
  tagQuery,
  setTagQuery,
  filteredTags,
}: {
  facets: {
    tags: Array<[string, number]>
    years: Array<[number, number]>
    venueTypes: Array<readonly [string, number]>
  }
  filters: ShelfFilters
  onChange: (next: ShelfFilters) => void
  tagQuery: string
  setTagQuery: (q: string) => void
  filteredTags: Array<[string, number]>
}) {
  return (
    <div className="max-h-[min(24rem,70vh)] overflow-y-auto overscroll-contain pb-1.5 [scrollbar-width:thin]">
      {facets.venueTypes.length > 0 ? (
        <>
          <SectionTitle>文献类型</SectionTitle>
          {facets.venueTypes.map(([vt, n]) => (
            <OptionRow
              key={vt}
              label={VENUE_TYPE_LABEL[vt] || vt}
              hint={String(n)}
              checked={filters.venueTypes.includes(vt)}
              onToggle={() => onChange({ ...filters, venueTypes: toggleIn(filters.venueTypes, vt) })}
            />
          ))}
        </>
      ) : null}

      {facets.years.length > 0 ? (
        <>
          <SectionTitle>出版年份</SectionTitle>
          {facets.years.map(([year, n]) => (
            <OptionRow
              key={year}
              label={String(year)}
              hint={String(n)}
              checked={filters.years.includes(year)}
              onToggle={() => onChange({ ...filters, years: toggleIn(filters.years, year) })}
            />
          ))}
        </>
      ) : null}

      {facets.tags.length > 0 ? (
        <>
          <SectionTitle>标签</SectionTitle>
          <div className="px-2.5 pb-1.5">
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9aa0b8]"
              />
              <input
                value={tagQuery}
                onChange={(e) => setTagQuery(e.target.value)}
                placeholder="搜索标签…"
                className="h-8 w-full rounded-xl border border-[#e4e6f0] bg-[#f7f8fd] pl-8 pr-3 text-[12px] text-ink outline-none transition placeholder:text-[#b0b5c9] focus:border-[#c7c9ef] focus:bg-white focus:ring-2 focus:ring-[#eef0fb]"
              />
            </div>
          </div>
          {filteredTags.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-3 py-5 text-center">
              <Tags size={16} className="text-[#c5c9de]" />
              <p className="text-[12px] text-[#9aa0b8]">没有匹配的标签</p>
            </div>
          ) : (
            filteredTags.map(([tag, n]) => (
              <OptionRow
                key={tag}
                label={tag}
                hint={String(n)}
                checked={filters.tags.some((t) => t.toLowerCase() === tag.toLowerCase())}
                onToggle={() => onChange({ ...filters, tags: toggleIn(filters.tags, tag) })}
              />
            ))
          )}
        </>
      ) : null}
    </div>
  )
}

export default function ShelfFilterBar({
  items,
  filters,
  onChange,
  arrange,
  onArrangeChange,
}: {
  items: UploadItem[]
  filters: ShelfFilters
  onChange: (next: ShelfFilters) => void
  arrange: ShelfArrange
  onArrangeChange: (next: ShelfArrange) => void
}) {
  const [openMenu, setOpenMenu] = useState<'arrange' | 'filter' | null>(null)
  const [tagQuery, setTagQuery] = useState('')

  const facets = useMemo(() => {
    const tagCounts = new Map<string, number>()
    const yearCounts = new Map<number, number>()
    const venueCounts = new Map<string, number>()

    for (const item of items) {
      const vt = paperVenueType(item)
      const venueKey = vt === 'unknown' ? 'other' : vt
      venueCounts.set(venueKey, (venueCounts.get(venueKey) || 0) + 1)
      const year = paperYear(item)
      if (year != null) yearCounts.set(year, (yearCounts.get(year) || 0) + 1)
      for (const tag of item.tags || []) {
        const name = tag.trim()
        if (!name) continue
        tagCounts.set(name, (tagCounts.get(name) || 0) + 1)
      }
    }

    const tags = [...tagCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'),
    )
    const years = [...yearCounts.entries()].sort((a, b) => b[0] - a[0])
    const venueTypes = ['journal', 'conference', 'preprint', 'other']
      .filter((k) => venueCounts.has(k))
      .map((k) => [k, venueCounts.get(k)!] as const)

    return { tags, years, venueTypes }
  }, [items])

  useEffect(() => {
    const nextVenue = filters.venueTypes.filter((vt) => facets.venueTypes.some(([k]) => k === vt))
    const nextYears = filters.years.filter((y) => facets.years.some(([k]) => k === y))
    const nextTags = filters.tags.filter((t) =>
      facets.tags.some(([name]) => name.toLowerCase() === t.toLowerCase()),
    )
    if (
      nextVenue.length === filters.venueTypes.length &&
      nextYears.length === filters.years.length &&
      nextTags.length === filters.tags.length
    ) {
      return
    }
    onChange({
      ...filters,
      venueTypes: nextVenue,
      years: nextYears,
      tags: nextTags,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: facets-driven prune
  }, [facets])

  const filteredTags = useMemo(() => {
    const q = tagQuery.trim().toLowerCase()
    if (!q) return facets.tags
    return facets.tags.filter(([name]) => name.toLowerCase().includes(q))
  }, [facets.tags, tagQuery])

  const active = shelfFiltersActive(filters)
  const hasMenus =
    facets.venueTypes.length > 0 || facets.years.length > 0 || facets.tags.length > 0

  const arrangeOpen = openMenu === 'arrange'
  const filterOpen = openMenu === 'filter'

  return (
    <div className="relative z-30 flex shrink-0 items-center justify-end gap-1.5">
      <Popover
        modal={false}
        open={arrangeOpen}
        onOpenChange={(next) => setOpenMenu(next ? 'arrange' : null)}
      >
        <PopoverTrigger asChild>
          <MenuTrigger
            label="排序"
            icon={<Layers size={12} />}
            open={arrangeOpen}
            marked={arrange !== 'flat'}
          />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="bottom"
          sideOffset={8}
          collisionPadding={12}
          className={panelClass}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <MenuHeader title="排序方式" />
          <div className="py-1">
            {ARRANGE_OPTIONS.map((opt) => (
              <OptionRow
                key={opt.id}
                label={opt.label}
                checked={arrange === opt.id}
                onToggle={() => {
                  onArrangeChange(opt.id)
                  setOpenMenu(null)
                }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {hasMenus ? (
        <Popover
          modal={false}
          open={filterOpen}
          onOpenChange={(next) => {
            setOpenMenu(next ? 'filter' : null)
            if (next) setTagQuery('')
          }}
        >
          <PopoverTrigger asChild>
            <MenuTrigger
              label="筛选"
              icon={<Filter size={12} />}
              open={filterOpen}
              marked={active}
            />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
            sideOffset={8}
            collisionPadding={12}
            className={cn(panelClass, 'w-72')}
          >
            <MenuHeader
              title="筛选文献"
              canReset={active}
              onReset={() => {
                onChange(EMPTY_SHELF_FILTERS)
                setTagQuery('')
              }}
            />
            <CombinedFilterPanel
              facets={facets}
              filters={filters}
              onChange={onChange}
              tagQuery={tagQuery}
              setTagQuery={setTagQuery}
              filteredTags={filteredTags}
            />
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  )
}
