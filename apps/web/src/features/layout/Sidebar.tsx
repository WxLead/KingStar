import { NavLink, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import {
  Plus,
  LayoutList,
  BookOpen,
  Star,
  FileText,
  File,
  FileCode,
  FileImage,
  FileType,
  FileSpreadsheet,
  Presentation,
  MoreHorizontal,
  Trash2,
  PanelLeftClose,
  Settings,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSidebarChrome } from '@/features/layout/SidebarChrome'
import { formatShortcut, useKeyboardShortcuts } from '@/features/settings/keyboardShortcuts'
import { useUploads } from '@/features/uploads/UploadsContext'
import { resolveStage, stageMeta } from '@/features/uploads/pipelineStage'
import type { UploadItem } from '@/services/api'

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

function fileIconMeta(filename: string): {
  icon: React.ReactNode
  bg: string
} {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'pdf':
      return {
        icon: <FileText size={18} strokeWidth={2.1} className="text-[#e23f2b]" />,
        bg: 'bg-[#fef2f2]',
      }
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'bmp':
      return {
        icon: <FileImage size={18} strokeWidth={2.1} className="text-[#22a06b]" />,
        bg: 'bg-[#ecfdf5]',
      }
    case 'ppt':
    case 'pptx':
      return {
        icon: <Presentation size={18} strokeWidth={2.1} className="text-[#e8801a]" />,
        bg: 'bg-[#fff7ed]',
      }
    case 'doc':
    case 'docx':
      return {
        icon: <FileType size={18} strokeWidth={2.1} className="text-[#2b6cd4]" />,
        bg: 'bg-[#eff6ff]',
      }
    case 'xls':
    case 'xlsx':
    case 'csv':
      return {
        icon: <FileSpreadsheet size={18} strokeWidth={2.1} className="text-[#059669]" />,
        bg: 'bg-[#ecfdf5]',
      }
    case 'md':
    case 'markdown':
      return {
        icon: <FileCode size={18} strokeWidth={2.1} className="text-[#7c3aed]" />,
        bg: 'bg-[#f5f3ff]',
      }
    case 'txt':
      return {
        icon: <FileText size={18} strokeWidth={2.1} className="text-[#6b7280]" />,
        bg: 'bg-[#f3f4f6]',
      }
    default:
      return {
        icon: <File size={18} strokeWidth={2.1} className="text-[#6a70a0]" />,
        bg: 'bg-[#f0f1f8]',
      }
  }
}

function canEnterReading(item: UploadItem): boolean {
  if (!item.last_task_id) return false
  const stage = resolveStage(item)
  return stage === 'parsed' || stage === 'completed' || stage === 'failed' || stage === 'translating'
}

function UploadRow({ item }: { item: UploadItem }) {
  const navigate = useNavigate()
  const { selectedId, setSelectedId, busyId, remove } = useUploads()
  const busy = busyId === item.upload_id
  const selected = selectedId === item.upload_id
  const stage = resolveStage(item)
  const status = stageMeta(stage)
  const fileMeta = fileIconMeta(item.filename)
  const readable = canEnterReading(item)

  const openWorkspace = () => {
    setSelectedId(item.upload_id)
    navigate('/')
  }

  const openReading = () => {
    setSelectedId(item.upload_id)
    navigate(`/read/${item.upload_id}`)
  }

  const onDelete = async () => {
    if (!confirm(`删除「${item.filename}」？`)) return
    try {
      await remove(item.upload_id)
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败')
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openWorkspace}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openWorkspace()
        }
      }}
      className={`group flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 transition-colors ${
        selected ? 'bg-white shadow-sm ring-1 ring-[#dfe1f4]' : 'hover:bg-white/70'
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${fileMeta.bg}`}>
        {fileMeta.icon}
      </span>

      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold leading-5 text-ink">
        {item.filename}
      </span>

      <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5">
        <span
          className={`inline-flex h-6 items-center justify-center rounded-md px-2 text-[11px] font-semibold tracking-wide ${status.badge}`}
        >
          {status.label}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="更多操作"
              onClick={(e) => e.stopPropagation()}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#4f46e5] transition hover:bg-[#eef0fb]"
            >
              <MoreHorizontal size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-[8.5rem]"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem
              className="gap-2 text-[13px]"
              disabled={!readable}
              onSelect={() => openReading()}
            >
              <BookOpen size={14} className="text-[#4f46e5]" />
              阅读
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-[13px] text-[#dc2626] focus:text-[#dc2626]"
              disabled={busy}
              onSelect={() => void onDelete()}
            >
              <Trash2 size={14} />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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

export default function Sidebar() {
  const { items, loading, error, setSelectedId } = useUploads()
  const { setOpen } = useSidebarChrome()
  const shortcuts = useKeyboardShortcuts()
  const toggleLabel = formatShortcut(shortcuts.toggleSidebar)

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
          <NavItem to="/library" icon={<BookOpen size={22} />} label="文献阅读" />
          <NavItem to="/favorites" icon={<Star size={22} />} label="我的收藏" />
          <NavItem to="/settings" icon={<Settings size={22} />} label="通用设置" />
        </motion.nav>

        <motion.div variants={itemAnim} className="mx-1 my-4 border-t border-[#e4e6f0]" />

        <motion.div variants={itemAnim} className="flex min-h-0 flex-1 flex-col">
          <p className="mb-2 px-3 text-[14px] font-bold tracking-wider text-[#9aa0b8]">
            已上传文件
            {!loading && <span className="ml-1 font-semibold text-[#6a70a0]">({items.length})</span>}
          </p>

          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {loading && <p className="px-3 text-[13px] text-[#9aa0b8]">加载中…</p>}
            {error && (
              <p className="px-3 text-[13px] leading-relaxed text-[#b45309]">
                {error.includes('Failed') || error.includes('fetch')
                  ? '无法连接后端，请先启动 services/api'
                  : error}
              </p>
            )}
            {!loading && !error && items.length === 0 && (
              <p className="px-3 text-[13px] leading-relaxed text-[#9aa0b8]">
                暂无文件。在右侧上传后会出现在这里。
              </p>
            )}
            {items.map((f) => (
              <UploadRow key={f.upload_id} item={f} />
            ))}
          </div>
        </motion.div>
      </motion.div>
    </aside>
  )
}
