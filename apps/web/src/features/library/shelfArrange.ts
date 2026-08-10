import type { UploadItem } from '@/services/api'

export type ShelfArrange = 'flat' | 'year' | 'venue'

export type ShelfGroup = {
  key: string
  label: string
  items: UploadItem[]
}

const VENUE_ORDER = ['journal', 'conference', 'preprint', 'other'] as const

const VENUE_LABEL: Record<string, string> = {
  journal: '期刊',
  conference: '会议',
  preprint: '预印本',
  other: '其他',
}

export function paperYear(item: UploadItem): number | null {
  const y = item.year as number | string | null | undefined
  if (y == null || y === '') return null
  const n = typeof y === 'number' ? y : Number(y)
  return Number.isFinite(n) && n >= 1800 && n <= 2100 ? Math.trunc(n) : null
}

export function paperVenueType(item: UploadItem): string {
  const vt = (item.venue_type || '').trim().toLowerCase()
  if (vt && VENUE_ORDER.includes(vt as (typeof VENUE_ORDER)[number])) return vt
  if (vt) return 'other'
  return 'unknown'
}

/** Group filtered shelf items by arrange mode. Empty groups are omitted.
 *  Within each group, item order follows the input list (caller should pre-sort). */
export function groupShelfItems(items: UploadItem[], arrange: ShelfArrange): ShelfGroup[] {
  if (arrange === 'flat' || items.length === 0) {
    return items.length
      ? [{ key: 'all', label: '全部', items: [...items] }]
      : []
  }

  if (arrange === 'year') {
    const buckets = new Map<string, UploadItem[]>()
    for (const item of items) {
      const y = paperYear(item)
      const key = y == null ? 'unknown' : String(y)
      const list = buckets.get(key) || []
      list.push(item)
      buckets.set(key, list)
    }
    const years = [...buckets.keys()]
      .filter((k) => k !== 'unknown')
      .map(Number)
      .sort((a, b) => b - a)
      .map(String)
    const keys = buckets.has('unknown') ? [...years, 'unknown'] : years
    return keys.map((key) => ({
      key,
      label: key === 'unknown' ? '未知年份' : key,
      items: buckets.get(key) || [],
    }))
  }

  // venue
  const buckets = new Map<string, UploadItem[]>()
  for (const item of items) {
    const key = paperVenueType(item)
    const list = buckets.get(key) || []
    list.push(item)
    buckets.set(key, list)
  }
  const keys = [
    ...VENUE_ORDER.filter((k) => buckets.has(k)),
    ...(buckets.has('unknown') ? (['unknown'] as const) : []),
  ]
  return keys.map((key) => ({
    key,
    label: key === 'unknown' ? '未分类' : VENUE_LABEL[key] || key,
    items: buckets.get(key) || [],
  }))
}

export const ARRANGE_OPTIONS: Array<{ id: ShelfArrange; label: string }> = [
  { id: 'flat', label: '默认' },
  { id: 'year', label: '按年份' },
  { id: 'venue', label: '按类型' },
]
