import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CloudUpload, Upload, Link as LinkIcon, Globe } from 'lucide-react'
import { useUploads } from '@/features/uploads/UploadsContext'
import { formatBytes } from '@/services/api'
import ParseWorkspace from '@/features/parse/ParseWorkspace'

const FORMAT_TIP = '支持 PDF 论文，以及 PNG / JPG / WebP 扫描图'

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
  const { upload, importUrl } = useUploads()
  const [busy, setBusy] = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [showFormatTip, setShowFormatTip] = useState(false)

  async function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file || busy || linkBusy) return
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

  async function handleImportLink() {
    const url = linkUrl.trim()
    if (!url || busy || linkBusy) return
    setLinkBusy(true)
    setMessage('正在从链接获取 PDF…')
    try {
      const item = await importUrl(url)
      setMessage(`已导入「${item.filename}」（${formatBytes(item.size)}）`)
      setLinkUrl('')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '链接导入失败')
    } finally {
      setLinkBusy(false)
    }
  }

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="mx-auto flex w-full max-w-[920px] flex-1 flex-col justify-center overflow-y-auto px-8 py-8 sm:px-12">
        <motion.div variants={rise} className="flex flex-col items-center">
          <h1 className="text-gradient-flow font-display text-[38px] leading-tight tracking-wide">
            StarT智能解析
          </h1>
          <p className="mt-3 text-center text-[16px] text-ink-soft">
            上传论文 PDF，进入预览与版面分析
          </p>
        </motion.div>

        <motion.div
          variants={rise}
          className="relative mt-7 flex min-h-[240px] flex-col rounded-2xl border-2 border-dashed border-[#b8bce0]/80 bg-white/35 px-8 py-6 shadow-[0_12px_40px_rgba(30,42,82,0.04)] transition-colors hover:border-[#8f94d4] hover:bg-white/50 sm:min-h-[300px] sm:px-12 sm:py-7"
          onMouseEnter={() => setShowFormatTip(true)}
          onMouseLeave={() => setShowFormatTip(false)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void handleFiles(e.dataTransfer.files)
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 py-4">
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/70 shadow-sm ring-1 ring-[#e4e6f2]/80"
            >
              <CloudUpload size={30} className="text-[#4f46e5]" />
            </motion.div>
            <p className="text-[17px] font-bold text-ink">
              拖拽文件到此处，或
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="ml-1 text-[#4f46e5] underline-offset-4 transition-colors hover:text-[#7c3aed] hover:underline"
              >
                点击上传
              </button>
            </p>

            <div className="relative mt-2 flex flex-col items-center">
              <motion.button
                type="button"
                whileHover={{ y: -2, boxShadow: '0 10px 28px rgba(99,68,229,0.4)' }}
                whileTap={{ scale: 0.97 }}
                disabled={busy || linkBusy}
                onClick={() => fileInputRef.current?.click()}
                className="btn-shine flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] px-7 py-3 text-[16px] font-bold text-white shadow-[0_6px_20px_rgba(99,68,229,0.3)] disabled:opacity-60"
              >
                <Upload size={18} />
                {busy ? '上传中…' : '选择文件上传'}
              </motion.button>
              <AnimatePresence>
                {showFormatTip && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 2 }}
                    transition={{ duration: 0.18 }}
                    className="pointer-events-none absolute left-1/2 top-full z-10 mt-2.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[#e4e6f2]/80 bg-white/95 px-3.5 py-2 text-[13px] text-ink-soft shadow-[0_8px_24px_rgba(30,42,82,0.1)] backdrop-blur-sm"
                  >
                    {FORMAT_TIP}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => void handleFiles(e.target.files)}
            />

            {message ? (
              <p className="max-w-lg rounded-lg bg-white/60 px-3 py-1.5 text-center text-[13px] leading-relaxed text-[#6a70a0] backdrop-blur-sm">
                {message}
              </p>
            ) : null}
          </div>
        </motion.div>

        <motion.div variants={rise} className="mt-5">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[#cfd2e8]/70" />
            <span className="shrink-0 text-[12px] font-medium tracking-wide text-[#7a819f]">
              或从链接导入
            </span>
            <div className="h-px flex-1 bg-[#cfd2e8]/70" />
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <div className="relative min-w-0 flex-1">
              <LinkIcon
                size={16}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9aa0b8]"
              />
              <input
                type="text"
                value={linkUrl}
                disabled={busy || linkBusy}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleImportLink()
                  }
                }}
                placeholder="arXiv / DOI / PDF 直链，如 https://arxiv.org/abs/2406.09246"
                className="h-[3.1rem] w-full rounded-xl border border-[#dfe1f0]/90 bg-white/55 pl-11 pr-4 text-[15px] text-ink outline-none transition-all placeholder:text-[#a8adc4] backdrop-blur-sm focus:border-[#4f46e5] focus:bg-white/80 focus:ring-4 focus:ring-[#4f46e5]/10 disabled:opacity-60"
              />
            </div>
            <motion.button
              type="button"
              whileHover={{ y: -2, boxShadow: '0 10px 28px rgba(99,68,229,0.4)' }}
              whileTap={{ scale: 0.97 }}
              disabled={busy || linkBusy || !linkUrl.trim()}
              className="btn-shine flex h-[3.1rem] shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] px-6 text-[15px] font-bold text-white shadow-[0_6px_20px_rgba(99,68,229,0.3)] disabled:opacity-60"
              onClick={() => void handleImportLink()}
            >
              <Globe size={17} />
              {linkBusy ? '获取中…' : '导入链接'}
            </motion.button>
          </div>
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
