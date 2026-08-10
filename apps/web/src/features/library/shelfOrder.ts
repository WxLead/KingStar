/** Persist custom literature order for the library grid (flat arrange). */

const STORAGE_KEY = 'start:library-order-v1'

export function loadLibraryOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}

export function saveLibraryOrder(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* ignore quota */
  }
}

/** Merge known upload ids into a saved order (new ids append). */
export function syncLibraryOrder(order: string[], knownIds: string[]): string[] {
  const known = new Set(knownIds)
  const next = order.filter((id) => known.has(id))
  for (const id of knownIds) {
    if (!next.includes(id)) next.push(id)
  }
  return next
}

export function sortByLibraryOrder<T extends { upload_id: string }>(
  items: T[],
  order: string[],
): T[] {
  if (!items.length) return items
  const rank = new Map(order.map((id, i) => [id, i]))
  return [...items].sort((a, b) => {
    const ra = rank.has(a.upload_id) ? rank.get(a.upload_id)! : Number.MAX_SAFE_INTEGER
    const rb = rank.has(b.upload_id) ? rank.get(b.upload_id)! : Number.MAX_SAFE_INTEGER
    if (ra !== rb) return ra - rb
    return 0
  })
}

/**
 * Reorder `order` so that among `visibleIds`, `activeId` moves to where `overId` is.
 * Non-visible ids keep their relative positions.
 */
export function moveVisibleInOrder(
  order: string[],
  visibleIds: string[],
  activeId: string,
  overId: string,
): string[] {
  if (activeId === overId) return order
  const visibleSet = new Set(visibleIds)
  if (!visibleSet.has(activeId) || !visibleSet.has(overId)) return order

  const base = syncLibraryOrder(order, [
    ...order,
    ...visibleIds,
  ])

  const visibleOrdered = base.filter((id) => visibleSet.has(id))
  // Prefer current visibleIds sequence if it differs (filtered view)
  const fromVisible = visibleIds.filter((id) => visibleOrdered.includes(id))
  const restVisible = visibleOrdered.filter((id) => !fromVisible.includes(id))
  const sequence = [...fromVisible, ...restVisible]

  const from = sequence.indexOf(activeId)
  const to = sequence.indexOf(overId)
  if (from < 0 || to < 0) return base

  const nextVisible = [...sequence]
  nextVisible.splice(from, 1)
  nextVisible.splice(to, 0, activeId)

  let vi = 0
  return base.map((id) => (visibleSet.has(id) ? nextVisible[vi++] : id))
}
