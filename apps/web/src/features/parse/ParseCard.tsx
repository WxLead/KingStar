import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CloudUpload,
  Upload,
  Link as LinkIcon,
  Globe,
  FileText,
  Image as ImageIcon,
  Presentation,
  FileType,
  File,
  FileCode,
} from 'lucide-react'
import { useUploads } from '@/features/uploads/UploadsContext'
import { formatBytes } from '@/services/api'
import ParseWorkspace from '@/features/parse/ParseWorkspace'

const formats = [
  { icon: FileText, color: '#e23f2b', name: 'PDF', ext: '.pdf' },
  { icon: ImageIcon, color: '#22a06b', name: '图片', ext: '.png .jpg .jpeg .gif' },
  { icon: Presentation, color: '#e8801a', name: 'PPT', ext: '.ppt .pptx' },
  { icon: FileType, color: '#2b6cd4', name: 'Word', ext: '.doc .docx' },
  { icon: File, color: '#6b7280', name: 'TXT', ext: '.txt' },
  { icon: FileCode, color: '#7c3aed', name: 'Markdown', ext: '.md' },
]

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } },
}
const rise = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } },
}

function UploadPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { upload } = useUploads()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file || busy) return
    setBusy(true)
    setMessage(`上传中：${file.name}`)
    try {
      const item = await upload(file)
      setMessage(`已上传「${item.filename}」（${formatBytes(item.size)}）`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '上传失败（请确认后端 services/api 已启动）')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-[#e8e9f4] bg-[#f8f8fd]"
    >
      <div className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col justify-center overflow-y-auto px-12 py-7">
        <motion.div variants={rise} className="flex flex-col items-center">
          <h1 className="text-gradient-flow font-display text-[38px] leading-tight tracking-wide">
            StarT智能解析
          </h1>
          <p className="mt-3 text-center text-[16px] text-ink-soft">
            上传文件后将进入预览与版面分析工作区
          </p>
        </motion.div>

        <motion.div
          variants={rise}
          className="mt-6 rounded-2xl border-2 border-dashed border-[#c9cbe8] bg-white/70 px-10 py-14 transition-colors hover:border-[#a5a8e0] hover:bg-white"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void handleFiles(e.dataTransfer.files)
          }}
        >
          <div className="flex flex-col items-center">
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#eef0fd] to-[#e4e6fb] shadow-sm"
            >
              <CloudUpload size={30} className="text-[#4f46e5]" />
            </motion.div>
            <p className="mt-3.5 text-[17px] font-bold text-ink">
              拖拽文件到此处，或
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="ml-1 text-[#4f46e5] underline-offset-4 transition-colors hover:text-[#7c3aed] hover:underline"
              >
                点击上传
              </button>
            </p>

            <motion.button
              type="button"
              whileHover={{ y: -2, boxShadow: '0 10px 28px rgba(99,68,229,0.4)' }}
              whileTap={{ scale: 0.97 }}
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="btn-shine mt-4 flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] px-7 py-3 text-[16px] font-bold text-white shadow-[0_6px_20px_rgba(99,68,229,0.3)] disabled:opacity-60"
            >
              <Upload size={18} />
              {busy ? '上传中…' : '选择文件上传'}
            </motion.button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.gif,.ppt,.pptx,.doc,.docx,.txt,.md"
              onChange={(e) => void handleFiles(e.target.files)}
            />
            {message && <p className="mt-3 text-center text-[14px] text-[#6a70a0]">{message}</p>}
          </div>

          <div className="mt-5 border-t border-[#eceef6] pt-4">
            <p className="text-[15px] font-bold text-ink">支持的文件格式</p>
            <div className="mt-3 grid grid-cols-6 gap-3">
              {formats.map((f, i) => (
                <motion.div
                  key={f.name}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.06, duration: 0.4 }}
                  whileHover={{ y: -3, boxShadow: '0 6px 18px rgba(30,42,82,0.1)' }}
                  className="flex cursor-default items-center gap-2.5 rounded-xl border border-[#eceef6] bg-white px-3 py-2.5"
                >
                  <f.icon size={22} style={{ color: f.color }} className="shrink-0" />
                  <div className="min-w-0 leading-tight">
                    <p className="text-[14px] font-bold text-ink">{f.name}</p>
                    <p className="mt-0.5 truncate text-[12px] text-[#9aa0b8]">{f.ext}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div variants={rise} className="mt-5">
          <div className="flex items-center gap-2 text-[16px] font-bold text-ink">
            <LinkIcon size={18} className="text-[#4f46e5]" />
            输入文档链接
          </div>
          <div className="mt-2.5 flex gap-3.5">
            <input
              type="text"
              placeholder="粘贴文档链接（支持 PDF 链接、在线文档等）"
              className="h-[3.25rem] flex-1 rounded-xl border border-[#dfe1f0] bg-white px-5 text-[16px] text-ink outline-none transition-all placeholder:text-[#a8adc4] focus:border-[#4f46e5] focus:ring-4 focus:ring-[#4f46e5]/10"
            />
            <motion.button
              type="button"
              whileHover={{ y: -2, boxShadow: '0 10px 28px rgba(99,68,229,0.4)' }}
              whileTap={{ scale: 0.97 }}
              className="btn-shine flex h-[3.25rem] items-center gap-2.5 rounded-xl bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] px-6 text-[16px] font-bold text-white shadow-[0_6px_20px_rgba(99,68,229,0.3)]"
              onClick={() => setMessage('链接解析将在后续版本接入')}
            >
              <Globe size={18} />
              解析链接
            </motion.button>
          </div>
          <p className="mt-2.5 text-[14px] text-[#9aa0b8]">支持 arXiv、Google Drive、OneDrive、GitHub、官网链接等</p>
        </motion.div>
      </div>
    </motion.div>
  )
}

export default function ParseCard() {
  const { items, selectedId } = useUploads()
  /** Keep last few workspaces mounted so switching back skips PDF re-render. */
  const [keptIds, setKeptIds] = useState<string[]>([])

  useEffect(() => {
    setKeptIds((prev) => {
      const existing = new Set(items.map((i) => i.upload_id))
      let next = prev.filter((id) => existing.has(id))
      if (selectedId && existing.has(selectedId)) {
        next = [selectedId, ...next.filter((id) => id !== selectedId)].slice(0, 3)
      }
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev
      return next
    })
  }, [selectedId, items])

  const renderIds = useMemo(() => {
    const existing = new Set(items.map((i) => i.upload_id))
    const base = selectedId && existing.has(selectedId)
      ? [selectedId, ...keptIds.filter((id) => id !== selectedId)]
      : keptIds
    return base.filter((id) => existing.has(id)).slice(0, 3)
  }, [selectedId, keptIds, items])

  const showUpload = !selectedId

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {showUpload && <UploadPanel />}
      {renderIds.map((id) => {
        const item = items.find((i) => i.upload_id === id)
        if (!item) return null
        const active = selectedId === id
        return (
          <div
            key={id}
            className={active ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
            aria-hidden={!active}
          >
            <ParseWorkspace item={item} />
          </div>
        )
      })}
    </div>
  )
}
