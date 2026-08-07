import { useNavigate } from 'react-router'
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpen,
  Wrench,
  FileText,
  File,
  FileCode,
  FileImage,
  FileType,
  FileSpreadsheet,
  Presentation,
  Library,
  NotebookPen,
} from 'lucide-react'
import ListPageHero, { MetaChip } from '@/features/layout/ListPageHero'
import { exportNotesMarkdown, hasNotesContent } from '@/features/reading/notesStorage'
import { useUploads } from '@/features/uploads/UploadsContext'
import { resolveStage, stageMeta } from '@/features/uploads/pipelineStage'
import { formatBytes, type UploadItem } from '@/services/api'

function canEnterReading(item: UploadItem): boolean {
  if (!item.last_task_id) return false
  const stage = resolveStage(item)
  return stage === 'parsed' || stage === 'completed' || stage === 'failed' || stage === 'translating'
}

function fileIconMeta(filename: string): { icon: React.ReactNode; bg: string } {
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
    default:
      return {
        icon: <File size={18} strokeWidth={2.1} className="text-[#6a70a0]" />,
        bg: 'bg-[#f0f1f8]',
      }
  }
}

function LibraryRow({ item }: { item: UploadItem }) {
  const navigate = useNavigate()
  const { setSelectedId } = useUploads()
  const stage = resolveStage(item)
  const status = stageMeta(stage)
  const readable = canEnterReading(item)
  const fileMeta = fileIconMeta(item.filename)

  const openReading = () => {
    if (!readable) return
    setSelectedId(item.upload_id)
    navigate(`/read/${item.upload_id}`)
  }

  const openWorkspace = (e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedId(item.upload_id)
    navigate('/')
  }

  const onExportNotes = () => {
    const ok = exportNotesMarkdown(item.upload_id, item.filename)
    if (!ok) {
      alert('暂无笔记可导出。请先在阅读室中写下笔记。')
    }
  }

  const hasNotes = hasNotesContent(item.upload_id)

  return (
    <li
      role={readable ? 'button' : undefined}
      tabIndex={readable ? 0 : undefined}
      onClick={openReading}
      onKeyDown={(e) => {
        if (!readable) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openReading()
        }
      }}
      className={`group grid grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_auto] items-center gap-x-3 rounded-2xl border bg-white/90 px-4 py-3.5 backdrop-blur-sm transition ${
        readable
          ? 'cursor-pointer border-[#eceef6] hover:-translate-y-0.5 hover:border-[#d4d7f0] hover:shadow-[0_8px_24px_-12px_rgba(79,70,229,0.25)]'
          : 'border-[#eceef6] opacity-75'
      }`}
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${fileMeta.bg}`}>
        {fileMeta.icon}
      </span>

      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-ink">{item.filename}</p>
        <p className="mt-0.5 truncate text-[12px] text-[#9aa0b8]">{formatBytes(item.size)}</p>
      </div>

      <span
        className={`inline-flex h-6 w-full items-center justify-center rounded-md text-[11px] font-semibold ${status.badge}`}
      >
        {status.label}
      </span>

      <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          title={readable ? '进入阅读室' : '请先完成版面分析'}
          disabled={!readable}
          onClick={openReading}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-[#4f46e5] transition hover:bg-[#eef0fb] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <BookOpen size={13} />
          阅读
        </button>
        <button
          type="button"
          title={hasNotes ? '导出笔记为 Markdown' : '暂无笔记'}
          disabled={!hasNotes}
          onClick={onExportNotes}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-[#4f46e5] transition hover:bg-[#eef0fb] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <NotebookPen size={13} />
          导出笔记
        </button>
        <button
          type="button"
          title="打开工作区"
          onClick={openWorkspace}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-[#6a70a0] transition hover:bg-[#f0f1f8]"
        >
          <Wrench size={13} />
          工作区
        </button>
      </div>
    </li>
  )
}

type LibraryFilter = 'readable' | 'pending' | 'all'

export default function LibraryPage() {
  const navigate = useNavigate()
  const { items, loading, error } = useUploads()
  const [filter, setFilter] = useState<LibraryFilter>('all')

  const readable = items.filter(canEnterReading)
  const others = items.filter((i) => !canEnterReading(i))
  const visible =
    filter === 'readable' ? readable : filter === 'pending' ? others : items

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-[#e8e9f4] bg-[#f8f8fd]">
      <ListPageHero
        title="文献阅读"
        subtitle="沉浸阅读原文、解析稿与译文，从书架直接进入阅读室。"
        meta={
          !loading && items.length > 0 ? (
            <>
              <MetaChip
                label="全部"
                value={items.length}
                tone="neutral"
                active={filter === 'all'}
                onClick={() => setFilter('all')}
              />
              <MetaChip
                label="可阅"
                value={readable.length}
                tone="accent"
                active={filter === 'readable'}
                onClick={() => setFilter('readable')}
              />
              <MetaChip
                label="未就绪"
                value={others.length}
                tone="muted"
                active={filter === 'pending'}
                onClick={() => setFilter('pending')}
              />
            </>
          ) : undefined
        }
        action={
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-xl bg-[#4f46e5] px-4 py-2 text-[13px] font-bold text-white shadow-sm transition hover:opacity-95"
          >
            去解析新文献
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {loading && <p className="px-2 text-[14px] text-[#9aa0b8]">加载中…</p>}
        {error && <p className="px-2 text-[14px] text-[#b45309]">{error}</p>}

        {!loading && !error && items.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center"
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
              先在工作区上传并完成版面分析，文献会出现在这里。
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

        {!loading && items.length > 0 && visible.length === 0 && (
          <p className="px-2 py-10 text-center text-[14px] text-[#9aa0b8]">
            {filter === 'readable' ? '暂无可阅读文献' : filter === 'pending' ? '没有未就绪的文献' : '暂无文献'}
          </p>
        )}

        {!loading && visible.length > 0 && (
          <motion.ul
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.04 } },
            }}
            className="space-y-2.5"
          >
            {visible.map((item) => (
              <motion.div
                key={item.upload_id}
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  show: { opacity: 1, y: 0 },
                }}
              >
                <LibraryRow item={item} />
              </motion.div>
            ))}
          </motion.ul>
        )}
      </div>
    </div>
  )
}
