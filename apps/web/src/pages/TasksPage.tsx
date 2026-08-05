import { useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import {
  FileText,
  File,
  FileCode,
  FileImage,
  FileType,
  FileSpreadsheet,
  Presentation,
  ScanSearch,
  Languages,
  Trash2,
  Loader2,
} from 'lucide-react'
import { useUploads } from '@/features/uploads/UploadsContext'
import {
  isStageBusy,
  resolveStage,
  stageMeta,
} from '@/features/uploads/pipelineStage'
import { formatBytes, type UploadItem } from '@/services/api'

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

function ActionBtn({
  label,
  title,
  onClick,
  disabled,
  tone = 'indigo',
  children,
}: {
  label: string
  title?: string
  onClick: () => void
  disabled?: boolean
  tone?: 'indigo' | 'danger' | 'muted'
  children: React.ReactNode
}) {
  const tones = {
    indigo: 'text-[#4f46e5] hover:bg-[#eef0fb]',
    danger: 'text-[#dc2626] hover:bg-[#fef2f2]',
    muted: 'text-[#6a70a0] hover:bg-[#f3f4fb]',
  }
  return (
    <button
      type="button"
      title={title || label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

function TaskRow({ item }: { item: UploadItem }) {
  const navigate = useNavigate()
  const { selectedId, setSelectedId, busyId, remove, parseLayout, translateOneClick } = useUploads()
  const stage = resolveStage(item)
  const status = stageMeta(stage)
  const fileMeta = fileIconMeta(item.filename)
  const rowBusy = busyId === item.upload_id
  const pipelineBusy = isStageBusy(stage)
  const busy = rowBusy || pipelineBusy
  const selected = selectedId === item.upload_id
  const canParse = !pipelineBusy
  const canTranslate = !pipelineBusy && (stage === 'parsed' || stage === 'completed' || stage === 'failed' || stage === 'unprocessed')

  const openWorkspace = () => {
    setSelectedId(item.upload_id)
    navigate('/')
  }

  const onParse = async () => {
    try {
      await parseLayout(item.upload_id, { parse_backend: 'pipeline' })
    } catch (err) {
      alert(err instanceof Error ? err.message : '版面分析启动失败')
    }
  }

  const onTranslate = async () => {
    try {
      await translateOneClick(item.upload_id, {
        parse_backend: 'pipeline',
        task_id: item.last_task_id,
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : '翻译启动失败')
    }
  }

  const onDelete = async () => {
    if (!confirm(`删除「${item.filename}」及其解析结果？`)) return
    try {
      await remove(item.upload_id)
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败')
    }
  }

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={openWorkspace}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openWorkspace()
        }
      }}
      className={`group grid cursor-pointer grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_auto] items-center gap-x-3 rounded-2xl border bg-white px-4 py-3.5 transition ${
        selected
          ? 'border-[#c7c9ef] shadow-[0_0_0_1px_rgba(79,70,229,0.12)]'
          : 'border-[#eceef6] hover:border-[#dfe1f4] hover:shadow-sm'
      }`}
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${fileMeta.bg}`}>
        {fileMeta.icon}
      </span>

      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-ink">{item.filename}</p>
        <p className="mt-0.5 truncate text-[12px] text-[#9aa0b8]">
          {formatBytes(item.size)}
          {item.last_task_id ? ` · ${item.last_task_id.slice(0, 8)}…` : ''}
        </p>
      </div>

      <span
        className={`inline-flex h-6 w-full items-center justify-center gap-1.5 rounded-md text-[11px] font-semibold ${status.badge}`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
        {status.label}
      </span>

      <div
        className="flex items-center justify-end gap-0.5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <ActionBtn
          label={stage === 'parsing' ? '分析中' : '版面分析'}
          title="启动版面分析（后台）"
          disabled={!canParse || rowBusy}
          onClick={() => void onParse()}
        >
          {stage === 'parsing' || (rowBusy && stage === 'unprocessed') ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <ScanSearch size={13} />
          )}
        </ActionBtn>
        <ActionBtn
          label={stage === 'translating' ? '翻译中' : '一键翻译'}
          title={
            stage === 'unprocessed'
              ? '未解析时将自动先分析再翻译'
              : '翻译已解析文档（后台）'
          }
          disabled={!canTranslate || rowBusy}
          onClick={() => void onTranslate()}
        >
          {stage === 'translating' ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Languages size={13} />
          )}
        </ActionBtn>
        <ActionBtn label="删除" title="删除文件" tone="danger" disabled={busy} onClick={() => void onDelete()}>
          <Trash2 size={13} />
        </ActionBtn>
      </div>
    </li>
  )
}

export default function TasksPage() {
  const { items, loading, error } = useUploads()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-[#e8e9f4] bg-[#f8f8fd]">
      <div className="shrink-0 px-8 pb-2 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[28px] text-ink">任务管理</h1>
            <p className="mt-2 text-[15px] text-ink-soft">
              管理已上传文件：版面分析、一键翻译、删除；点击行打开左右栏工作区
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-xl bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] px-4 py-2 text-[13px] font-bold text-white shadow-sm transition hover:opacity-95"
          >
            去上传新文件
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8 pt-4">
        {loading && <p className="text-[15px] text-[#9aa0b8]">加载中…</p>}
        {error && (
          <p className="text-[15px] text-[#b45309]">
            {error.includes('Failed') || error.includes('fetch')
              ? '无法连接 BFF，请先启动 services/api'
              : error}
          </p>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#d5d8ec] bg-white/70 px-6 py-14 text-center">
            <p className="text-[15px] text-[#9aa0b8]">暂无文件。先在「新解析」上传文档。</p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-4 text-[13px] font-semibold text-[#4f46e5] hover:underline"
            >
              前往上传
            </button>
          </div>
        )}
        {!loading && items.length > 0 && (
          <motion.ul
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.04 } },
            }}
            className="space-y-2.5"
          >
            {items.map((f) => (
              <motion.div
                key={f.upload_id}
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  show: { opacity: 1, y: 0 },
                }}
              >
                <TaskRow item={f} />
              </motion.div>
            ))}
          </motion.ul>
        )}
      </div>
    </div>
  )
}
