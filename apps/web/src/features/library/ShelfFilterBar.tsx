import { forwardRef, useEffect, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import {
  CalendarDays,
  Check,
  ChevronDown,
  Filter,
  Search,
  SlidersHorizontal,
  Star,
  StickyNote,
  Tags,
  X,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  filterToolbarInner,
  toolbarCountBadge,
  toolbarIconBox,
  toolbarSurface,
} from '@/features/layout/toolbarChrome'
import { cn } from '@/lib/utils'
import type { UploadItem } from '@/services/api'
import { ARRANGE_OPTIONS, paperVenueType, paperYear, type ShelfArrange } from '@/features/library/shelfArrange'

export type ShelfFilters = {
  tags: string[]
  venueTypes: string[]
  years: number[]
  favoritedOnly: boolean
  notesOnly: boolean
}

export const EMPTY_SHELF_FILTERS: ShelfFilters = {
  tags: [],
  venueTypes: [],
  years: [],
  favoritedOnly: false,
  notesOnly: false,
}

const VENUE_TYPE_LABEL: Record<string, string> = {
  journal: '期刊',
  conference: '会议',
  preprint: '预印本',
  other: '其他',
}

export function shelfFiltersActive(f: ShelfFilters): boolean {
  return (
    f.tags.length > 0 ||
    f.venueTypes.length > 0 ||
    f.years.length > 0 ||
    f.favoritedOnly ||
    f.notesOnly
  )
}

export function applyShelfFilters(items: UploadItem[], f: ShelfFilters): UploadItem[] {
  return items.filter((item) => {
    if (f.favoritedOnly && !item.favorited) return false
    if (f.notesOnly && !item.has_notes) return false
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
}

const MenuTrigger = forwardRef<HTMLButtonElement, MenuTriggerProps>(
  function MenuTrigger({ label, icon, count, open, className, type = 'button', ...props }, ref) {
    const active = Boolean(count) || open
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
          open && !count ? 'ring-2 ring-[#c7caf0]' : null,
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

function QuickChip({
  active,
  onClick,
  icon,
  label,
  tone = 'indigo',
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  tone?: 'indigo' | 'amber'
}) {
  const activeCls =
    tone === 'amber'
      ? 'bg-[#f59e0b] text-white shadow-[0_4px_12px_-4px_rgba(245,158,11,0.55)]'
      : 'bg-[#4f46e5] text-white shadow-[0_4px_12px_-4px_rgba(79,70,229,0.55)]'
  const idleHover =
    tone === 'amber'
      ? 'hover:text-amber-600 hover:ring-amber-200/80'
      : 'hover:text-[#4f46e5] hover:ring-[#cfd3ef]'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        chipBase,
        active
          ? activeCls
          : cn('bg-white text-[#5a6086] ring-1 ring-[#e3e6f3] hover:bg-[#f7f8fd]', idleHover),
      )}
    >
      {icon}
      {label}
    </button>
  )
}

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

function MenuPanel({
  title,
  children,
  search,
}: {
  title: string
  children: ReactNode
  search?: ReactNode
}) {
  return (
    <div className="overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-[#eef0f6] px-3.5 py-2.5">
        <Filter size={12} className="text-[#4f46e5]" />
        <p className="text-[12px] font-bold tracking-wide text-[#4a5078]">{title}</p>
      </div>
      {search}
      <div className="max-h-56 overflow-y-auto overscroll-contain py-1 [scrollbar-width:thin]">
        {children}
      </div>
    </div>
  )
}

const panelClass =
  'z-[200] w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#e2e5f2] bg-white p-0 text-[#2f3358] shadow-[0_20px_48px_-20px_rgba(35,42,90,0.42)]'

function FilterPopover({
  menu,
  openMenu,
  setOpenMenu,
  label,
  icon,
  count,
  title,
  widthClass,
  children,
}: {
  menu: 'type' | 'year' | 'tag'
  openMenu: 'type' | 'year' | 'tag' | null
  setOpenMenu: (m: 'type' | 'year' | 'tag' | null) => void
  label: string
  icon?: ReactNode
  count?: number
  title: string
  widthClass?: string
  children: ReactNode
}) {
  const open = openMenu === menu
  return (
    <Popover
      modal={false}
      open={open}
      onOpenChange={(next) => {
        if (next) setOpenMenu(menu)
        else if (openMenu === menu) setOpenMenu(null)
      }}
    >
      <PopoverTrigger asChild>
        <MenuTrigger label={label} icon={icon} count={count} open={open} />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        collisionPadding={12}
        className={cn(panelClass, widthClass)}
        onOpenAutoFocus={(e) => {
          if (menu !== 'tag') e.preventDefault()
        }}
      >
        <MenuPanel title={title}>{children}</MenuPanel>
      </PopoverContent>
    </Popover>
  )
}

export default function ShelfFilterBar({
  items,
  filters,
  onChange,
  arrange,
  onArrangeChange,
  hideFavoritedFilter = false,
}: {
  items: UploadItem[]
  filters: ShelfFilters
  onChange: (next: ShelfFilters) => void
  arrange: ShelfArrange
  onArrangeChange: (next: ShelfArrange) => void
  /** Favorites page already scopes to starred items */
  hideFavoritedFilter?: boolean
}) {
  const [openMenu, setOpenMenu] = useState<'type' | 'year' | 'tag' | null>(null)
  const [tagQuery, setTagQuery] = useState('')

  const facets = useMemo(() => {
    const tagCounts = new Map<string, number>()
    const yearCounts = new Map<number, number>()
    const venueCounts = new Map<string, number>()
    let favorited = 0
    let withNotes = 0

    for (const item of items) {
      if (item.favorited) favorited += 1
      if (item.has_notes) withNotes += 1
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

    return { tags, years, venueTypes, favorited, withNotes }
  }, [items])

  useEffect(() => {
    const nextVenue = filters.venueTypes.filter((vt) => facets.venueTypes.some(([k]) => k === vt))
    const nextYears = filters.years.filter((y) => facets.years.some(([k]) => k === y))
    const nextTags = filters.tags.filter((t) =>
      facets.tags.some(([name]) => name.toLowerCase() === t.toLowerCase()),
    )
    const nextFav = hideFavoritedFilter
      ? false
      : filters.favoritedOnly && facets.favorited > 0
    const nextNotes = filters.notesOnly && facets.withNotes > 0
    if (
      nextVenue.length === filters.venueTypes.length &&
      nextYears.length === filters.years.length &&
      nextTags.length === filters.tags.length &&
      nextFav === filters.favoritedOnly &&
      nextNotes === filters.notesOnly
    ) {
      return
    }
    onChange({
      ...filters,
      venueTypes: nextVenue,
      years: nextYears,
      tags: nextTags,
      favoritedOnly: nextFav,
      notesOnly: nextNotes,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: facets-driven prune
  }, [facets, hideFavoritedFilter])

  const filteredTags = useMemo(() => {
    const q = tagQuery.trim().toLowerCase()
    if (!q) return facets.tags
    return facets.tags.filter(([name]) => name.toLowerCase().includes(q))
  }, [facets.tags, tagQuery])

  const active = shelfFiltersActive({
    ...filters,
    favoritedOnly: hideFavoritedFilter ? false : filters.favoritedOnly,
  })
  const activeCount =
    (hideFavoritedFilter ? 0 : filters.favoritedOnly ? 1 : 0) +
    (filters.notesOnly ? 1 : 0) +
    filters.venueTypes.length +
    filters.years.length +
    filters.tags.length

  const hasMenus =
    facets.venueTypes.length > 0 || facets.years.length > 0 || facets.tags.length > 0
  const hasQuick =
    (!hideFavoritedFilter && facets.favorited > 0) || facets.withNotes > 0

  return (
    <div className={toolbarSurface}>
      <div className={cn(filterToolbarInner, 'flex-wrap gap-y-2')}>
        <div className="mr-0.5 flex shrink-0 items-center gap-1.5 text-[#8b91b3]">
          <span className={toolbarIconBox}>
            <SlidersHorizontal size={13} strokeWidth={2.25} />
          </span>
          <span className="hidden text-[11px] font-bold tracking-[0.08em] text-[#9aa0b8] sm:inline">
            筛选
          </span>
          {active ? <span className={toolbarCountBadge}>{activeCount}</span> : null}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {ARRANGE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={arrange === opt.id}
              onClick={() => onArrangeChange(opt.id)}
              className={cn(
                chipBase,
                arrange === opt.id
                  ? 'bg-[#4f46e5] text-white shadow-[0_4px_12px_-4px_rgba(79,70,229,0.55)]'
                  : 'bg-white text-[#5a6086] ring-1 ring-[#e3e6f3] hover:bg-[#f7f8fd] hover:text-[#4f46e5] hover:ring-[#cfd3ef]',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {hasQuick || hasMenus ? (
          <span className="mx-0.5 hidden h-4 w-px bg-[#dfe2f0] sm:block" aria-hidden />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {!hideFavoritedFilter && facets.favorited > 0 ? (
            <QuickChip
              active={filters.favoritedOnly}
              onClick={() => onChange({ ...filters, favoritedOnly: !filters.favoritedOnly })}
              icon={<Star size={12} fill={filters.favoritedOnly ? 'currentColor' : 'none'} />}
              label="收藏"
              tone="amber"
            />
          ) : null}

          {facets.withNotes > 0 ? (
            <QuickChip
              active={filters.notesOnly}
              onClick={() => onChange({ ...filters, notesOnly: !filters.notesOnly })}
              icon={<StickyNote size={12} />}
              label="笔记"
            />
          ) : null}

          {hasQuick && hasMenus ? (
            <span className="mx-0.5 hidden h-4 w-px bg-[#dfe2f0] sm:block" aria-hidden />
          ) : null}

          {facets.venueTypes.length > 0 ? (
            <FilterPopover
              menu="type"
              openMenu={openMenu}
              setOpenMenu={setOpenMenu}
              label="类型"
              icon={<Filter size={12} />}
              count={filters.venueTypes.length || undefined}
              title="文献类型"
            >
              {facets.venueTypes.map(([vt, n]) => (
                <OptionRow
                  key={vt}
                  label={VENUE_TYPE_LABEL[vt] || vt}
                  hint={String(n)}
                  checked={filters.venueTypes.includes(vt)}
                  onToggle={() =>
                    onChange({ ...filters, venueTypes: toggleIn(filters.venueTypes, vt) })
                  }
                />
              ))}
            </FilterPopover>
          ) : null}

          {facets.years.length > 0 ? (
            <FilterPopover
              menu="year"
              openMenu={openMenu}
              setOpenMenu={setOpenMenu}
              label="年份"
              icon={<CalendarDays size={12} />}
              count={filters.years.length || undefined}
              title="出版年份"
              widthClass="w-44"
            >
              {facets.years.map(([year, n]) => (
                <OptionRow
                  key={year}
                  label={String(year)}
                  hint={String(n)}
                  checked={filters.years.includes(year)}
                  onToggle={() => onChange({ ...filters, years: toggleIn(filters.years, year) })}
                />
              ))}
            </FilterPopover>
          ) : null}

          {facets.tags.length > 0 ? (
            <Popover
              modal={false}
              open={openMenu === 'tag'}
              onOpenChange={(next) => {
                setOpenMenu(next ? 'tag' : null)
                if (next) setTagQuery('')
              }}
            >
              <PopoverTrigger asChild>
                <MenuTrigger
                  label="标签"
                  icon={<Tags size={12} />}
                  count={filters.tags.length || undefined}
                  open={openMenu === 'tag'}
                />
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="bottom"
                sideOffset={8}
                collisionPadding={12}
                className={cn(panelClass, 'w-72')}
              >
                <MenuPanel
                  title="按标签筛选"
                  search={
                    <div className="border-b border-[#eef0f6] px-2.5 py-2">
                      <div className="relative">
                        <Search
                          size={13}
                          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9aa0b8]"
                        />
                        <input
                          value={tagQuery}
                          onChange={(e) => setTagQuery(e.target.value)}
                          placeholder="搜索标签…"
                          autoFocus
                          className="h-8 w-full rounded-xl border border-[#e4e6f0] bg-[#f7f8fd] pl-8 pr-3 text-[12px] text-ink outline-none transition placeholder:text-[#b0b5c9] focus:border-[#c7c9ef] focus:bg-white focus:ring-2 focus:ring-[#eef0fb]"
                        />
                      </div>
                    </div>
                  }
                >
                  {filteredTags.length === 0 ? (
                    <div className="flex flex-col items-center gap-1.5 px-3 py-7 text-center">
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
                        onToggle={() =>
                          onChange({ ...filters, tags: toggleIn(filters.tags, tag) })
                        }
                      />
                    ))
                  )}
                </MenuPanel>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>

        {active ? (
          <button
            type="button"
            onClick={() => {
              onChange(EMPTY_SHELF_FILTERS)
              setOpenMenu(null)
            }}
            className="inline-flex h-[30px] shrink-0 items-center gap-1 rounded-[10px] px-2 text-[12px] font-semibold text-[#9aa0b8] transition hover:bg-white hover:text-[#5a6086] hover:ring-1 hover:ring-[#e3e6f3]"
          >
            <X size={12} />
            清除
          </button>
        ) : null}
      </div>
    </div>
  )
}
