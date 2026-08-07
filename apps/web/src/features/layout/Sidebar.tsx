import { useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import {
  Plus,
  LayoutList,
  Library,
  Star,
  PanelLeftClose,
  Settings,
  Clock3,
  FileSearch,
} from 'lucide-react'
import { useSidebarChrome } from '@/features/layout/SidebarChrome'
import { BookShelfRow, titleFromFilename } from '@/features/reading/bookCover'
import { hasNotesContent } from '@/features/reading/notesStorage'
import {
  formatOpenedAt,
  listRecentReads,
  removeRecentRead,
} from '@/features/reading/readingRecent'
import {
  hideParseRecord,
  listHiddenParseIds,
} from '@/features/reading/sidebarParseRecent'
import { formatShortcut, useKeyboardShortcuts } from '@/features/settings/keyboardShortcuts'
import { useUploads } from '@/features/uploads/UploadsContext'
import { isStageBusy, resolveStage, stageMeta } from '@/features/uploads/pipelineStage'
import { formatUploadTime, type UploadItem } from '@/services/api'

function StarTLogo() {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3.5 px-2">
      <motion.svg
        width="48"
        height="48"
        viewBox="0 0 40 40"
        fill="none"
        whileHover={{ rotate: 12, scale: 1.08 }}
        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
        className="shrink-0"
      >
        <rect width="40" height="40" rx="12" fill="url(#starGrad)" />
        <path
          d="M20 8.5l3.3 6.8 7.5 1-5.5 5.2 1.4 7.4L20 25.5l-6.7 3.4 1.4-7.4-5.5-5.2 7.5-1L20 8.5z"
          fill="#ffffff"
        />
        <defs>
          <linearGradient id="starGrad" x1="0" y1="0" x2="40" y2="40">
            <stop stopColor="#4f46e5" />
            <stop offset="1" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
      </motion.svg>
      <div className="min-w-0 leading-tight">
        <span className="font-display block text-[32px] text-ink">StarT</span>
        <span className="block truncate text-[13px] font-medium tracking-wide text-[#9aa0b8]">
          论文解析 · 翻译 · 解读
        </span>
      </div>
    </div>
  )
}

function NavItem({
  to,
  icon,
  label,
  primary,
  end,
  onNavigate,
}: {
  to: string
  icon: React.ReactNode
  label: string
  primary?: boolean
  end?: boolean
  onNavigate?: () => void
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className="block"
      onClick={() => {
        onNavigate?.()
      }}
    >
      {({ isActive }) => (
        <motion.div
          whileHover={{ x: 3 }}
          className={`flex w-full items-center gap-3.5 rounded-xl px-4 py-3.5 text-[17px] font-semibold transition-colors duration-200 ${
            isActive
              ? 'bg-white text-[#4f46e5] shadow-sm'
              : primary
                ? 'text-[#4f46e5] hover:bg-white hover:shadow-sm'
                : 'text-ink-soft hover:bg-white hover:text-ink hover:shadow-sm'
          }`}
        >
          {icon}
          <span className="flex-1 text-left">{label}</span>
        </motion.div>
      )}
    </NavLink>
  )
}

function canEnterReading(item: UploadItem): boolean {
  if (!item.last_task_id) return false
  const stage = resolveStage(item)
  return stage === 'parsed' || stage === 'completed' || stage === 'failed' || stage === 'translating'
}

function stageDotClass(stage: ReturnType<typeof resolveStage>): string {
  switch (stage) {
    case 'unprocessed':
    case 'failed':
      return 'bg-[#dc2626]'
    case 'parsing':
    case 'translating':
      return 'bg-[#4f46e5]'
    case 'parsed':
      return 'bg-[#2563eb]'
    case 'completed':
      return 'bg-[#059669]'
  }
}

function SectionLabel({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode
  label: string
  count?: number
}) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 px-1">
      <span className="text-[#8b91b3]">{icon}</span>
      <p className="text-[12px] font-bold tracking-wider text-[#9aa0b8]">{label}</p>
      {typeof count === 'number' ? (
        <span className="text-[11px] font-semibold tabular-nums text-[#b0b4c8]">({count})</span>
      ) : null}
    </div>
  )
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
}
const itemAnim = {
  hidden: { opacity: 0, x: -18 },
  show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
}

const RECENT_PARSE_LIMIT = 6
const RECENT_READ_LIMIT = 6

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { items, loading, error, selectedId, setSelectedId } = useUploads()
  const { setOpen } = useSidebarChrome()
  const shortcuts = useKeyboardShortcuts()
  const toggleLabel = formatShortcut(shortcuts.toggleSidebar)
  const [listTick, setListTick] = useState(0)

  const recentParses = useMemo(() => {
    const hidden = listHiddenParseIds()
    return [...items]
      .filter((i) => !hidden.has(i.upload_id))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, RECENT_PARSE_LIMIT)
  }, [items, listTick])

  const recentReads = useMemo(() => {
    const byId = new Map(items.map((i) => [i.upload_id, i]))
    return listRecentReads()
      .map((r) => {
        const item = byId.get(r.uploadId)
        return item && canEnterReading(item) ? { item, openedAt: r.openedAt } : null
      })
      .filter(Boolean)
      .slice(0, RECENT_READ_LIMIT) as Array<{ item: UploadItem; openedAt: number }>
  }, [items, location.pathname, listTick])

  const dismissParse = (uploadId: string) => {
    hideParseRecord(uploadId)
    setListTick((n) => n + 1)
  }

  const dismissRead = (uploadId: string) => {
    removeRecentRead(uploadId)
    setListTick((n) => n + 1)
  }

  const openWorkspace = (item: UploadItem) => {
    setSelectedId(item.upload_id)
    navigate('/')
  }

  const openReading = (item: UploadItem) => {
    setSelectedId(item.upload_id)
    navigate(`/read/${item.upload_id}`)
  }

  const bookMeta = (item: UploadItem) => {
    const hasNotes = hasNotesContent(item.upload_id)
    const parts = [item.has_zh ? '原文 · 译文' : '原文']
    if (hasNotes) parts.push('笔记')
    return parts.join(' · ')
  }

  return (
    <aside className="sticky top-0 flex h-screen w-[340px] shrink-0 flex-col self-start bg-[#f5f6fb] px-4 pb-6 pt-7">
      <motion.div variants={container} initial="hidden" animate="show" className="flex min-h-0 flex-1 flex-col">
        <motion.div variants={itemAnim} className="flex items-start gap-1">
          <StarTLogo />
          <button
            type="button"
            title={`收起侧边栏 (${toggleLabel})`}
            onClick={() => setOpen(false)}
            className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#6a70a0] transition hover:bg-white hover:text-[#4f46e5] hover:shadow-sm"
          >
            <PanelLeftClose size={18} />
          </button>
        </motion.div>

        <motion.nav variants={itemAnim} className="mt-7 space-y-1.5">
          <NavItem
            to="/"
            end
            icon={<Plus size={22} strokeWidth={2.5} />}
            label="新解析"
            primary
            onNavigate={() => setSelectedId(null)}
          />
          <NavItem to="/tasks" icon={<LayoutList size={22} />} label="任务管理" />
          <NavItem to="/library" icon={<Library size={22} />} label="我的书架" />
          <NavItem to="/favorites" icon={<Star size={22} />} label="我的收藏" />
          <NavItem to="/settings" icon={<Settings size={22} />} label="通用设置" />
        </motion.nav>

        <motion.div variants={itemAnim} className="mx-1 my-4 border-t border-[#e4e6f0]" />

        <motion.div variants={itemAnim} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin] [scrollbar-color:#c9cce4_transparent]">
            {loading && <p className="px-2 text-[13px] text-[#9aa0b8]">加载中…</p>}
            {error && (
              <p className="px-2 text-[13px] leading-relaxed text-[#b45309]">
                {error.includes('Failed') || error.includes('fetch')
                  ? '无法连接后端，请先启动 services/api'
                  : error}
              </p>
            )}

            {!loading && !error && (
              <>
                <section>
                  <SectionLabel
                    icon={<FileSearch size={12} />}
                    label="最近解析"
                    count={recentParses.length}
                  />
                  {recentParses.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[#e4e6f0] bg-white/40 px-3 py-4 text-[12px] leading-relaxed text-[#9aa0b8]">
                      暂无解析记录。上传文件后会出现在这里。
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {recentParses.map((item) => {
                        const stage = resolveStage(item)
                        const meta = stageMeta(stage)
                        return (
                          <BookShelfRow
                            key={`parse-${item.upload_id}`}
                            title={titleFromFilename(item.filename)}
                            uploadId={item.upload_id}
                            hasZh={item.has_zh}
                            subtitle={formatUploadTime(item.created_at)}
                            status={{
                              label: meta.label,
                              className: meta.badge,
                              busy: isStageBusy(stage),
                              dotClassName: stageDotClass(stage),
                            }}
                            selected={selectedId === item.upload_id && location.pathname === '/'}
                            onClick={() => openWorkspace(item)}
                            onDismiss={() => dismissParse(item.upload_id)}
                          />
                        )
                      })}
                    </div>
                  )}
                </section>

                <section>
                  <SectionLabel
                    icon={<Clock3 size={12} />}
                    label="最近阅读"
                    count={recentReads.length}
                  />
                  {recentReads.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[#e4e6f0] bg-white/40 px-3 py-4 text-[12px] leading-relaxed text-[#9aa0b8]">
                      暂无阅读记录。打开书架中的文献后会出现在这里。
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {recentReads.map(({ item, openedAt }) => (
                        <BookShelfRow
                          key={`read-${item.upload_id}`}
                          title={titleFromFilename(item.filename)}
                          uploadId={item.upload_id}
                          hasZh={item.has_zh}
                          subtitle={formatOpenedAt(openedAt)}
                          meta={bookMeta(item)}
                          selected={
                            selectedId === item.upload_id &&
                            location.pathname.startsWith('/read/')
                          }
                          onClick={() => openReading(item)}
                          onDismiss={() => dismissRead(item.upload_id)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </aside>
  )
}
