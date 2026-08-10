import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { Star, ArrowRight, Pencil } from 'lucide-react'
import ListPageHero from '@/features/layout/ListPageHero'
import PaperMetaDialog from '@/features/library/PaperMetaDialog'
import ShelfFilterBar, {
  applyShelfFilters,
  EMPTY_SHELF_FILTERS,
  type ShelfFilters,
} from '@/features/library/ShelfFilterBar'
import { groupShelfItems, type ShelfArrange } from '@/features/library/shelfArrange'
import { BookCover } from '@/features/reading/bookCover'
import { useUploads } from '@/features/uploads/UploadsContext'
import { resolveStage } from '@/features/uploads/pipelineStage'
import {
  paperDisplayTitle,
  setPaperFavorite,
  type UploadItem,
} from '@/services/api'

function canEnterReading(item: UploadItem): boolean {
  if (!item.last_task_id) return false
  const stage = resolveStage(item)
  return stage === 'parsed' || stage === 'completed' || stage === 'failed' || stage === 'translating'
}

function FavoriteGrid({
  items,
  onOpen,
  onEdit,
  onUnfavorite,
}: {
  items: UploadItem[]
  onOpen: (item: UploadItem) => void
  onEdit: (item: UploadItem) => void
  onUnfavorite: (item: UploadItem) => void
}) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.03 } },
      }}
      className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    >
      {items.map((item) => {
        const title = paperDisplayTitle(item)
        return (
          <motion.div
            key={item.upload_id}
            variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
            className="group relative"
          >
            <button
              type="button"
              onClick={() => onOpen(item)}
              className="flex w-full flex-col text-left transition hover:-translate-y-0.5"
            >
              <BookCover
                title={title}
                uploadId={item.upload_id}
                venue={item.venue}
                size="lg"
              />
            </button>
            <div className="absolute right-0.5 top-0.5 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
              <button
                type="button"
                title="取消收藏"
                onClick={() => onUnfavorite(item)}
                className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-amber-500 shadow-sm"
              >
                <Star size={12} fill="currentColor" />
              </button>
              <button
                type="button"
                title="编辑信息"
                onClick={() => onEdit(item)}
                className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-[#8b91b3] shadow-sm hover:text-[#4f46e5]"
              >
                <Pencil size={12} />
              </button>
            </div>
          </motion.div>
        )
      })}
    </motion.div>
  )
}

export default function FavoritesPage() {
  const navigate = useNavigate()
  const { items, loading, error, setSelectedId, refresh } = useUploads()
  const [metaItem, setMetaItem] = useState<UploadItem | null>(null)
  const [filters, setFilters] = useState<ShelfFilters>(EMPTY_SHELF_FILTERS)
  const [arrange, setArrange] = useState<ShelfArrange>('flat')

  const favorites = useMemo(
    () =>
      items
        .filter((i) => i.favorited && canEnterReading(i))
        .sort((a, b) =>
          (b.favorited_at || b.created_at || '').localeCompare(a.favorited_at || a.created_at || ''),
        ),
    [items],
  )

  const filtered = useMemo(() => applyShelfFilters(favorites, filters), [favorites, filters])

  const groups = useMemo(() => groupShelfItems(filtered, arrange), [filtered, arrange])

  const onFiltersChange = (next: ShelfFilters) => {
    setFilters(next)
    if (next.years.length > 0 && filters.years.length === 0) setArrange('year')
    else if (next.venueTypes.length > 0 && filters.venueTypes.length === 0) setArrange('venue')
  }

  const openReading = (item: UploadItem) => {
    setSelectedId(item.upload_id)
    navigate(`/read/${item.upload_id}`)
  }

  const unfavorite = async (item: UploadItem) => {
    try {
      await setPaperFavorite(item.upload_id, false)
      await refresh()
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-[#e8e9f4] bg-[#f8f8fd]">
      <ListPageHero title="我的收藏" />

      {favorites.length > 0 ? (
        <ShelfFilterBar
          items={favorites}
          filters={filters}
          onChange={onFiltersChange}
          arrange={arrange}
          onArrangeChange={setArrange}
          hideFavoritedFilter
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {loading && <p className="text-[14px] text-[#9aa0b8]">加载中…</p>}
        {error && <p className="text-[14px] text-[#b45309]">{error}</p>}

        {!loading && !error && favorites.length === 0 && (
          <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef0fb] text-amber-500">
              <Star size={24} />
            </div>
            <p className="mt-4 text-[16px] font-semibold text-ink">还没有收藏</p>
            <p className="mt-1.5 text-[14px] text-[#9aa0b8]">
              在文献封面右上角点星星，即可加入收藏。
            </p>
            <Link
              to="/library"
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-[#4f46e5] px-4 py-2 text-[13px] font-semibold text-white"
            >
              去文献
              <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {!loading && !error && favorites.length > 0 && filtered.length === 0 && (
          <p className="py-16 text-center text-[14px] text-[#9aa0b8]">没有符合筛选的收藏</p>
        )}

        {filtered.length > 0 &&
          (arrange === 'flat' ? (
            <FavoriteGrid
              items={filtered}
              onOpen={openReading}
              onEdit={setMetaItem}
              onUnfavorite={(item) => void unfavorite(item)}
            />
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map((group) => (
                <section key={group.key} className="min-w-0">
                  <div className="mb-2.5 flex items-baseline gap-2 px-0.5">
                    <h3 className="text-[13px] font-bold tracking-wide text-[#2f3358]">
                      {group.label}
                    </h3>
                    <span className="text-[11px] font-semibold tabular-nums text-[#9aa0b8]">
                      {group.items.length}
                    </span>
                  </div>
                  <FavoriteGrid
                    items={group.items}
                    onOpen={openReading}
                    onEdit={setMetaItem}
                    onUnfavorite={(item) => void unfavorite(item)}
                  />
                </section>
              ))}
            </div>
          ))}
      </div>

      <PaperMetaDialog
        item={metaItem}
        open={Boolean(metaItem)}
        onOpenChange={(open) => {
          if (!open) setMetaItem(null)
        }}
        onSaved={() => void refresh()}
      />
    </div>
  )
}
