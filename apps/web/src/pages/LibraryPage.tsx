import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import {
  Library,
  ArrowRight,
  LayoutList,
  Clock3,
  BookMarked,
  Star,
  Pencil,
  GripVertical,
} from 'lucide-react'
import ListPageHero from '@/features/layout/ListPageHero'
import {
  sectionToolbarInner,
  toolbarCountBadge,
  toolbarIconBox,
  toolbarSurface,
} from '@/features/layout/toolbarChrome'
import PaperMetaDialog from '@/features/library/PaperMetaDialog'
import ShelfFilterBar, {
  applyShelfFilters,
  EMPTY_SHELF_FILTERS,
  type ShelfFilters,
} from '@/features/library/ShelfFilterBar'
import { groupShelfItems, type ShelfArrange } from '@/features/library/shelfArrange'
import {
  loadLibraryOrder,
  moveVisibleInOrder,
  saveLibraryOrder,
  sortByLibraryOrder,
  syncLibraryOrder,
} from '@/features/library/shelfOrder'
import { BookCover, BookShelfRow } from '@/features/reading/bookCover'
import {
  formatOpenedAt,
  listRecentReads,
} from '@/features/reading/readingRecent'
import { useUploads } from '@/features/uploads/UploadsContext'
import { resolveStage } from '@/features/uploads/pipelineStage'
import {
  identifyPaper,
  paperDisplayTitle,
  reindexLibrary,
  setPaperFavorite,
  type UploadItem,
} from '@/services/api'
import { cn } from '@/lib/utils'

function canEnterReading(item: UploadItem): boolean {
  if (!item.last_task_id) return false
  const stage = resolveStage(item)
  return stage === 'parsed' || stage === 'completed' || stage === 'failed' || stage === 'translating'
}

function itemHasNotes(item: UploadItem): boolean {
  return Boolean(item.has_notes)
}

function needsIdentify(item: UploadItem): boolean {
  return !item.title && !item.doi && !item.venue
}

function ShelfCard({
  item,
  onOpen,
  onEdit,
  onToggleFavorite,
  reorderable,
  dragging,
  dragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  item: UploadItem
  onOpen: () => void
  onEdit: () => void
  onToggleFavorite: () => void
  reorderable?: boolean
  dragging?: boolean
  dragOver?: boolean
  onDragStart?: (id: string) => void
  onDragOver?: (id: string) => void
  onDrop?: (id: string) => void
  onDragEnd?: () => void
}) {
  const title = paperDisplayTitle(item)
  const suppressClick = useRef(false)

  return (
    <motion.div
      layout
      variants={{
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0 },
      }}
      className={cn(
        'group relative flex flex-col text-left',
        dragging && 'opacity-40',
        dragOver && reorderable && 'ring-2 ring-[#4f46e5]/70 ring-offset-2 ring-offset-[#f0f1fa] rounded-xl',
      )}
      draggable={Boolean(reorderable)}
      onDragStart={(e) => {
        if (!reorderable) return
        // framer-motion types this as Pointer/Mouse/Touch; HTML5 DnD still provides dataTransfer
        const de = e as unknown as DragEvent<HTMLDivElement>
        de.dataTransfer.effectAllowed = 'move'
        de.dataTransfer.setData('text/plain', item.upload_id)
        suppressClick.current = false
        onDragStart?.(item.upload_id)
      }}
      onDragOver={(e) => {
        if (!reorderable) return
        e.preventDefault()
        const de = e as unknown as DragEvent<HTMLDivElement>
        de.dataTransfer.dropEffect = 'move'
        onDragOver?.(item.upload_id)
      }}
      onDrop={(e) => {
        if (!reorderable) return
        e.preventDefault()
        suppressClick.current = true
        onDrop?.(item.upload_id)
      }}
      onDragEnd={() => {
        onDragEnd?.()
        window.setTimeout(() => {
          suppressClick.current = false
        }, 50)
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (suppressClick.current) return
          onOpen()
        }}
        className="flex flex-col text-left transition duration-200 hover:-translate-y-0.5"
      >
        <BookCover
          title={title}
          uploadId={item.upload_id}
          venue={item.venue}
          venueType={item.venue_type}
          arxivId={item.arxiv_id}
          size="lg"
        />
      </button>
      {reorderable ? (
        <span
          title="拖拽排序"
          className="absolute left-0.5 top-0.5 flex h-6 w-6 cursor-grab items-center justify-center rounded-md bg-white/90 text-[#8b91b3] opacity-0 shadow-sm transition group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical size={12} />
        </span>
      ) : null}
      <div className="absolute right-0.5 top-0.5 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          title={item.favorited ? '取消收藏' : '收藏'}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite()
          }}
          className={`flex h-6 w-6 items-center justify-center rounded-md bg-white/90 shadow-sm ${
            item.favorited ? 'text-amber-500' : 'text-[#8b91b3] hover:text-amber-500'
          }`}
        >
          <Star size={12} fill={item.favorited ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          title="文献信息"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-[#8b91b3] shadow-sm hover:text-[#4f46e5]"
        >
          <Pencil size={12} />
        </button>
      </div>
    </motion.div>
  )
}

function ShelfGrid({
  items,
  onOpen,
  onEdit,
  onToggleFavorite,
  reorderable,
  onReorder,
}: {
  items: UploadItem[]
  onOpen: (item: UploadItem) => void
  onEdit: (item: UploadItem) => void
  onToggleFavorite: (item: UploadItem) => void
  reorderable?: boolean
  onReorder?: (activeId: string, overId: string) => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  return (
    <div className="relative rounded-2xl border border-[#e6e8f4] bg-gradient-to-b from-white/75 to-[#f0f1fa]/45 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
      <div
        className="pointer-events-none absolute inset-x-5 bottom-2.5 h-1.5 rounded-full bg-gradient-to-r from-transparent via-[#d4d7ec]/75 to-transparent blur-[1px]"
        aria-hidden
      />
      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.03 } },
        }}
        className="relative grid grid-cols-3 gap-x-3.5 gap-y-5 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      >
        {items.map((item) => (
          <ShelfCard
            key={item.upload_id}
            item={item}
            onOpen={() => onOpen(item)}
            onEdit={() => onEdit(item)}
            onToggleFavorite={() => onToggleFavorite(item)}
            reorderable={reorderable}
            dragging={draggingId === item.upload_id}
            dragOver={overId === item.upload_id && draggingId !== item.upload_id}
            onDragStart={(id) => {
              setDraggingId(id)
              setOverId(id)
            }}
            onDragOver={(id) => setOverId(id)}
            onDrop={(id) => {
              if (draggingId && draggingId !== id) onReorder?.(draggingId, id)
              setDraggingId(null)
              setOverId(null)
            }}
            onDragEnd={() => {
              setDraggingId(null)
              setOverId(null)
            }}
          />
        ))}
      </motion.div>
    </div>
  )
}

function PaneHeader({
  icon,
  title,
  count,
  trailing,
}: {
  icon: ReactNode
  title: string
  count?: number
  trailing?: ReactNode
}) {
  return (
    <div className={toolbarSurface}>
      <div className={sectionToolbarInner}>
        <div className="flex min-w-0 items-center gap-2">
          <span className={toolbarIconBox}>{icon}</span>
          <h2 className="truncate text-[14px] font-semibold tracking-wide text-[#2f3358]">{title}</h2>
          {typeof count === 'number' ? (
            <span className={toolbarCountBadge}>{count}</span>
          ) : null}
        </div>
        {trailing ? <div className="ml-auto min-w-0 shrink-0">{trailing}</div> : null}
      </div>
    </div>
  )
}

export default function LibraryPage() {
  const navigate = useNavigate()
  const { items, loading, error, setSelectedId, refresh } = useUploads()
  const [filters, setFilters] = useState<ShelfFilters>(EMPTY_SHELF_FILTERS)
  const [arrange, setArrange] = useState<ShelfArrange>('flat')
  const [metaItem, setMetaItem] = useState<UploadItem | null>(null)
  const [libraryOrder, setLibraryOrder] = useState<string[]>(() => loadLibraryOrder())
  const autoIdentifyDone = useState(() => ({ current: false }))[0]
  const [identifyBanner, setIdentifyBanner] = useState<string | null>(null)

  useEffect(() => {
    void reindexLibrary().catch(() => undefined)
  }, [])

  // Backfill identify for already-parsed papers missing metadata
  useEffect(() => {
    if (loading || autoIdentifyDone.current) return
    const targets = items.filter((i) => canEnterReading(i) && needsIdentify(i)).slice(0, 8)
    if (!targets.length) {
      if (items.length > 0) autoIdentifyDone.current = true
      return
    }
    autoIdentifyDone.current = true
    let cancelled = false
    void (async () => {
      setIdentifyBanner(`正在补全元数据（0/${targets.length}）…`)
      let ok = 0
      let fail = 0
      for (let i = 0; i < targets.length; i++) {
        if (cancelled) break
        try {
          await identifyPaper(targets[i].upload_id, { force: false })
          ok += 1
        } catch {
          fail += 1
        }
        if (!cancelled) {
          setIdentifyBanner(`正在补全元数据（${i + 1}/${targets.length}）…`)
        }
      }
      if (cancelled) return
      await refresh()
      if (fail === 0) {
        setIdentifyBanner(ok > 0 ? `已补全 ${ok} 篇文献元数据` : null)
      } else {
        setIdentifyBanner(`元数据补全：成功 ${ok}，失败 ${fail}`)
      }
      window.setTimeout(() => setIdentifyBanner(null), 5000)
    })()
    return () => {
      cancelled = true
    }
  }, [items, loading, refresh, autoIdentifyDone])

  const readable = useMemo(() => items.filter(canEnterReading), [items])
  const pending = useMemo(() => items.filter((i) => !canEnterReading(i)), [items])

  // Keep persisted order in sync with known readable papers
  useEffect(() => {
    const ids = readable.map((i) => i.upload_id)
    setLibraryOrder((prev) => {
      const next = syncLibraryOrder(prev, ids)
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev
      saveLibraryOrder(next)
      return next
    })
  }, [readable])

  const recentPairs = useMemo(() => {
    const byId = new Map(readable.map((i) => [i.upload_id, i]))
    return listRecentReads()
      .map((r) => {
        const item = byId.get(r.uploadId)
        return item ? { item, openedAt: r.openedAt } : null
      })
      .filter(Boolean) as Array<{ item: UploadItem; openedAt: number }>
  }, [readable])

  const shelfItems = useMemo(() => {
    const list = applyShelfFilters([...readable], filters)
    return sortByLibraryOrder(list, libraryOrder)
  }, [readable, filters, libraryOrder])

  const shelfGroups = useMemo(
    () => groupShelfItems(shelfItems, arrange),
    [shelfItems, arrange],
  )

  const onFiltersChange = (next: ShelfFilters) => {
    setFilters(next)
    // Linkage: first pick of year/type switches arrange mode
    if (next.years.length > 0 && filters.years.length === 0) setArrange('year')
    else if (next.venueTypes.length > 0 && filters.venueTypes.length === 0) setArrange('venue')
  }

  const onReorderShelf = (activeId: string, overId: string, scopeIds?: string[]) => {
    const visibleIds = scopeIds ?? shelfItems.map((i) => i.upload_id)
    setLibraryOrder((prev) => {
      const next = moveVisibleInOrder(prev, visibleIds, activeId, overId)
      saveLibraryOrder(next)
      return next
    })
  }

  const openReading = (item: UploadItem) => {
    setSelectedId(item.upload_id)
    navigate(`/read/${item.upload_id}`)
  }

  const toggleFavorite = async (item: UploadItem) => {
    try {
      await setPaperFavorite(item.upload_id, !item.favorited)
      await refresh()
    } catch {
      /* ignore */
    }
  }

  const showDual = !loading && !error && readable.length > 0
  const showGlobalEmpty = !loading && !error && items.length === 0
  const showPendingOnly = !loading && !error && items.length > 0 && readable.length === 0

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-[#e8e9f4] bg-[#f8f8fd]">
      <ListPageHero
        title="我的文献"
        action={
          <button
            type="button"
            onClick={() => navigate('/tasks')}
            className="group relative inline-flex shrink-0 items-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-br from-[#4f46e5] to-[#6366f1] px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.7)] transition duration-200 hover:-translate-y-0.5 hover:from-[#4338ca] hover:to-[#4f46e5] hover:shadow-[0_12px_26px_-10px_rgba(79,70,229,0.8)] active:translate-y-0"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.28),transparent_50%)]"
            />
            <LayoutList size={15} strokeWidth={2.5} className="relative shrink-0" />
            <span className="relative tracking-wide">任务管理</span>
          </button>
        }
      />

      <div className="relative min-h-0 flex-1">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 18% 12%, #e4e7fb 0%, transparent 42%), radial-gradient(circle at 88% 70%, #ebe4f6 0%, transparent 36%)',
          }}
          aria-hidden
        />

        {identifyBanner ? (
          <p className="relative border-b border-[#eceef6] bg-[#fafbff] px-6 py-2.5 text-[12px] text-[#6a70a0]">
            {identifyBanner}
          </p>
        ) : null}

        {loading && (
          <p className="relative px-6 py-5 text-[14px] text-[#9aa0b8]">整理文献…</p>
        )}
        {error && <p className="relative px-6 py-5 text-[14px] text-[#b45309]">{error}</p>}

        {showGlobalEmpty && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center"
          >
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#eef0fd] to-[#e4e6fb] shadow-sm"
            >
              <Library size={28} className="text-[#4f46e5]" />
            </motion.div>
            <p className="mt-5 text-[16px] font-semibold text-ink">还没有文献</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[#9aa0b8]">
              先在工作区上传并完成版面分析，可阅读的文献会出现在这里。
            </p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-5 rounded-xl bg-[#4f46e5] px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-95"
            >
              前往上传
            </button>
          </motion.div>
        )}

        {showPendingOnly && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative mx-auto max-w-lg px-4 py-14 text-center"
          >
            <p className="text-[16px] font-semibold text-ink">还没有可阅读的文献</p>
            <p className="mt-2 text-[14px] leading-relaxed text-[#9aa0b8]">
              有 {pending.length} 篇仍在解析或等待处理。去任务管理跟进进度后，即可在此阅读。
            </p>
            <Link
              to="/tasks"
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-[#4f46e5] px-4 py-2 text-[13px] font-semibold text-white"
            >
              打开任务管理
              <ArrowRight size={14} />
            </Link>
          </motion.div>
        )}

        {showDual && (
          <div className="relative flex h-full min-h-0 flex-col">
            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2 md:overflow-hidden">
              <aside className="flex max-h-[42vh] min-h-0 flex-col overflow-hidden border-[#e8e9f4] md:max-h-none md:border-r">
                <PaneHeader
                  icon={<Clock3 size={13} />}
                  title="最近阅读"
                  count={recentPairs.length}
                />
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-width:thin] [scrollbar-color:#c9cce4_transparent]">
                  {recentPairs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#dfe1f4] bg-white/40 px-4 py-10 text-center">
                      <p className="text-[13px] font-medium text-[#6a70a0]">暂无最近阅读</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#9aa0b8]">
                        从右侧点开一篇，下次就能从这里继续。
                      </p>
                    </div>
                  ) : (
                    <motion.div
                      initial="hidden"
                      animate="show"
                      variants={{
                        hidden: {},
                        show: { transition: { staggerChildren: 0.04 } },
                      }}
                      className="flex flex-col gap-2"
                    >
                      {recentPairs.map(({ item, openedAt }) => {
                        const title = paperDisplayTitle(item)
                        const hasNotes = itemHasNotes(item)
                        return (
                          <BookShelfRow
                            key={item.upload_id}
                            title={title}
                            uploadId={item.upload_id}
                            hasZh={item.has_zh}
                            hasNotes={hasNotes}
                            venue={item.venue}
                            venueType={item.venue_type}
                            arxivId={item.arxiv_id}
                            subtitle={formatOpenedAt(openedAt)}
                            meta={`${item.has_zh ? '原文 · 译文' : '原文'}${hasNotes ? ' · 笔记' : ''}`}
                            onClick={() => openReading(item)}
                          />
                        )
                      })}
                    </motion.div>
                  )}
                </div>
              </aside>

              <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-[#e8e9f4] md:border-t-0">
                <PaneHeader
                  icon={<BookMarked size={13} />}
                  title="全部文献"
                  count={shelfItems.length}
                  trailing={
                    <ShelfFilterBar
                      items={readable}
                      filters={filters}
                      onChange={onFiltersChange}
                      arrange={arrange}
                      onArrangeChange={setArrange}
                    />
                  }
                />
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-width:thin] [scrollbar-color:#c9cce4_transparent]">
                  {shelfItems.length === 0 ? (
                    <p className="py-16 text-center text-[14px] text-[#9aa0b8]">没有符合筛选的文献</p>
                  ) : arrange === 'flat' ? (
                    <ShelfGrid
                      items={shelfItems}
                      onOpen={openReading}
                      onEdit={setMetaItem}
                      onToggleFavorite={(item) => void toggleFavorite(item)}
                      reorderable
                      onReorder={onReorderShelf}
                    />
                  ) : (
                    <div className="flex flex-col gap-5">
                      {shelfGroups.map((group) => (
                        <section key={group.key} className="min-w-0">
                          <div className="mb-2.5 flex items-baseline gap-2 px-0.5">
                            <h3 className="text-[13px] font-bold tracking-wide text-[#2f3358]">
                              {group.label}
                            </h3>
                            <span className="text-[11px] font-semibold tabular-nums text-[#9aa0b8]">
                              {group.items.length}
                            </span>
                          </div>
                          <ShelfGrid
                            items={group.items}
                            onOpen={openReading}
                            onEdit={setMetaItem}
                            onToggleFavorite={(item) => void toggleFavorite(item)}
                            reorderable
                            onReorder={(activeId, overId) =>
                              onReorderShelf(
                                activeId,
                                overId,
                                group.items.map((i) => i.upload_id),
                              )
                            }
                          />
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {pending.length > 0 ? (
              <div className="shrink-0 border-t border-[#e8e9f4] bg-white/70 px-4 py-2.5 backdrop-blur-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] text-[#6a70a0]">
                    还有 <span className="font-semibold text-ink">{pending.length}</span> 篇尚未就绪
                  </p>
                  <Link
                    to="/tasks"
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#4f46e5] hover:underline"
                  >
                    去任务管理
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        )}
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
