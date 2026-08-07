import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { Library, ArrowRight, LayoutList, Clock3, BookMarked } from 'lucide-react'
import ListPageHero, { MetaChip } from '@/features/layout/ListPageHero'
import { BookCover, BookShelfRow, titleFromFilename } from '@/features/reading/bookCover'
import { hasNotesContent } from '@/features/reading/notesStorage'
import {
  formatOpenedAt,
  listRecentReads,
} from '@/features/reading/readingRecent'
import { useUploads } from '@/features/uploads/UploadsContext'
import { resolveStage } from '@/features/uploads/pipelineStage'
import type { UploadItem } from '@/services/api'

function canEnterReading(item: UploadItem): boolean {
  if (!item.last_task_id) return false
  const stage = resolveStage(item)
  return stage === 'parsed' || stage === 'completed' || stage === 'failed' || stage === 'translating'
}

function ShelfCard({ item, onOpen }: { item: UploadItem; onOpen: () => void }) {
  const title = titleFromFilename(item.filename)
  const hasNotes = hasNotesContent(item.upload_id)
  const hasZh = Boolean(item.has_zh)

  return (
    <motion.button
      type="button"
      layout
      variants={{
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0 },
      }}
      onClick={onOpen}
      className="group flex flex-col text-left transition duration-200 hover:-translate-y-0.5"
    >
      <BookCover title={title} uploadId={item.upload_id} hasZh={hasZh} hasNotes={hasNotes} />
      <div className="mt-1.5 min-w-0 px-0.5">
        <h3 className="truncate text-[11px] font-semibold text-ink transition group-hover:text-[#4f46e5]">
          {title}
        </h3>
        <p className="mt-px truncate text-[10px] text-[#9aa0b8]">
          {hasZh ? '原文 · 译文' : '原文'}
          {hasNotes ? ' · 笔记' : ''}
        </p>
      </div>
    </motion.button>
  )
}

function PaneHeader({
  icon,
  title,
  count,
  subtitle,
  trailing,
}: {
  icon: ReactNode
  title: string
  count?: number
  subtitle: string
  trailing?: ReactNode
}) {
  return (
    <div className="relative shrink-0 overflow-hidden border-b border-[#e4e6f2]">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white via-[#f4f5fc] to-[#eceef8]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full opacity-50 blur-2xl"
        style={{ background: 'radial-gradient(circle, #cfd3f5 0%, transparent 70%)' }}
        aria-hidden
      />
      <div className="relative flex min-h-[76px] items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#4f46e5] shadow-[0_4px_12px_-6px_rgba(79,70,229,0.55)] ring-1 ring-[#e4e6f4]">
              {icon}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-[15px] font-bold tracking-wide text-ink">{title}</h2>
                {typeof count === 'number' ? (
                  <span className="rounded-full bg-[#4f46e5]/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#4f46e5]">
                    {count}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-[12px] text-[#9aa0b8]">{subtitle}</p>
            </div>
          </div>
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
    </div>
  )
}

export default function LibraryPage() {
  const navigate = useNavigate()
  const { items, loading, error, setSelectedId } = useUploads()
  const [shelfFilter, setShelfFilter] = useState<'all' | 'notes' | 'zh'>('all')

  const readable = useMemo(() => items.filter(canEnterReading), [items])
  const pending = useMemo(() => items.filter((i) => !canEnterReading(i)), [items])

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
    let list = [...readable]
    if (shelfFilter === 'notes') list = list.filter((i) => hasNotesContent(i.upload_id))
    if (shelfFilter === 'zh') list = list.filter((i) => i.has_zh)
    const recentRank = new Map(listRecentReads().map((r, idx) => [r.uploadId, idx]))
    list.sort((a, b) => {
      const ra = recentRank.has(a.upload_id) ? recentRank.get(a.upload_id)! : 999
      const rb = recentRank.has(b.upload_id) ? recentRank.get(b.upload_id)! : 999
      if (ra !== rb) return ra - rb
      return a.filename.localeCompare(b.filename, 'zh')
    })
    return list
  }, [readable, shelfFilter])

  const openReading = (item: UploadItem) => {
    setSelectedId(item.upload_id)
    navigate(`/read/${item.upload_id}`)
  }

  const showDual = !loading && !error && readable.length > 0
  const showGlobalEmpty = !loading && !error && items.length === 0
  const showPendingOnly = !loading && !error && items.length > 0 && readable.length === 0

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-[#e8e9f4] bg-[#f8f8fd]">
      <ListPageHero
        title="书架"
        subtitle="左侧继续上次阅读，右侧浏览全部文献。点封面进入阅读室。"
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

        {loading && (
          <p className="relative px-6 py-5 text-[14px] text-[#9aa0b8]">整理书架…</p>
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
            <p className="mt-5 text-[16px] font-semibold text-ink">书架还是空的</p>
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
            <p className="text-[16px] font-semibold text-ink">还没有可上架的文献</p>
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
              {/* Left: recent */}
              <aside className="flex max-h-[42vh] min-h-0 flex-col overflow-hidden border-[#e8e9f4] md:max-h-none md:border-r">
                <PaneHeader
                  icon={<Clock3 size={15} />}
                  title="最近阅读"
                  count={recentPairs.length}
                  subtitle={
                    recentPairs.length > 0 ? '从这里继续上次打开的文献' : '打开文献后会出现在这里'
                  }
                />
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-width:thin] [scrollbar-color:#c9cce4_transparent]">
                  {recentPairs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#dfe1f4] bg-white/40 px-4 py-10 text-center">
                      <p className="text-[13px] font-medium text-[#6a70a0]">暂无最近阅读</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#9aa0b8]">
                        从右侧书架点开一篇，下次就能从这里继续。
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
                        const title = titleFromFilename(item.filename)
                        const hasNotes = hasNotesContent(item.upload_id)
                        return (
                          <BookShelfRow
                            key={item.upload_id}
                            title={title}
                            uploadId={item.upload_id}
                            hasZh={item.has_zh}
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

              {/* Right: full shelf */}
              <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-[#e8e9f4] md:border-t-0">
                <PaneHeader
                  icon={<BookMarked size={15} />}
                  title="全部书架"
                  count={readable.length}
                  subtitle={
                    shelfFilter === 'notes'
                      ? '仅显示含笔记的文献'
                      : shelfFilter === 'zh'
                        ? '仅显示已有译文的文献'
                        : '点击封面进入阅读室'
                  }
                  trailing={
                    <div className="flex flex-wrap justify-end gap-1">
                      <MetaChip
                        label="全部"
                        value={readable.length}
                        tone="neutral"
                        active={shelfFilter === 'all'}
                        onClick={() => setShelfFilter('all')}
                      />
                      <MetaChip
                        label="笔记"
                        value={readable.filter((i) => hasNotesContent(i.upload_id)).length}
                        tone="accent"
                        active={shelfFilter === 'notes'}
                        onClick={() => setShelfFilter('notes')}
                      />
                      <MetaChip
                        label="译文"
                        value={readable.filter((i) => i.has_zh).length}
                        tone="muted"
                        active={shelfFilter === 'zh'}
                        onClick={() => setShelfFilter('zh')}
                      />
                    </div>
                  }
                />
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-width:thin] [scrollbar-color:#c9cce4_transparent]">
                  {shelfItems.length === 0 ? (
                    <p className="py-16 text-center text-[14px] text-[#9aa0b8]">没有符合筛选的文献</p>
                  ) : (
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
                        className="relative grid grid-cols-4 gap-x-2.5 gap-y-4 sm:grid-cols-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7"
                      >
                        {shelfItems.map((item) => (
                          <ShelfCard
                            key={item.upload_id}
                            item={item}
                            onOpen={() => openReading(item)}
                          />
                        ))}
                      </motion.div>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {pending.length > 0 ? (
              <div className="shrink-0 border-t border-[#e8e9f4] bg-white/70 px-4 py-2.5 backdrop-blur-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] text-[#6a70a0]">
                    还有 <span className="font-semibold text-ink">{pending.length}</span> 篇尚未上架
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
    </div>
  )
}
