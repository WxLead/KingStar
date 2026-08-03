import { useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Settings,
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

export default function ParseCard() {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#e8e9f4] bg-[#f8f8fd]"
    >
      <button className="absolute right-6 top-5 z-10 flex items-center gap-1.5 text-[15px] text-ink-soft transition-colors hover:text-[#4f46e5]">
        <Settings size={17} />
        设置
      </button>

      <div className="mx-auto flex w-full max-w-[860px] flex-1 flex-col justify-center overflow-y-auto px-10 py-5">
        {/* 标题区 */}
        <motion.div variants={rise} className="flex flex-col items-center">
          <h1 className="text-gradient-flow font-display text-[30px] leading-tight tracking-wide">
            StarT智能解析
          </h1>
          <p className="mt-2 text-center text-[13.5px] text-ink-soft">
            支持多种格式文档上传或在线链接，为您提供专业的版面分析
          </p>
        </motion.div>

        {/* 拖拽上传区 */}
        <motion.div
          variants={rise}
          className="mt-4 rounded-xl border-2 border-dashed border-[#c9cbe8] bg-white/70 px-8 pb-4 pt-5 transition-colors hover:border-[#a5a8e0] hover:bg-white"
        >
          <div className="flex flex-col items-center">
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#eef0fd] to-[#e4e6fb] shadow-sm"
            >
              <CloudUpload size={26} className="text-[#4f46e5]" />
            </motion.div>
            <p className="mt-2.5 text-[15px] font-bold text-ink">
              拖拽文件到此处，或
              <button
                onClick={() => fileInputRef.current?.click()}
                className="ml-1 text-[#4f46e5] underline-offset-4 transition-colors hover:text-[#7c3aed] hover:underline"
              >
                点击上传
              </button>
            </p>

            <motion.button
              whileHover={{ y: -2, boxShadow: '0 10px 28px rgba(99,68,229,0.4)' }}
              whileTap={{ scale: 0.97 }}
              onClick={() => fileInputRef.current?.click()}
              className="btn-shine mt-3 flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] px-6 py-2.5 text-[14px] font-bold text-white shadow-[0_6px_20px_rgba(99,68,229,0.3)]"
            >
              <Upload size={16} />
              选择文件上传
            </motion.button>
            <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.gif,.ppt,.pptx,.doc,.docx,.txt,.md" />
          </div>

          {/* 支持的文件格式 */}
          <div className="mt-4 border-t border-[#eceef6] pt-3">
            <p className="text-[13px] font-bold text-ink">支持的文件格式</p>
            <div className="mt-2.5 grid grid-cols-6 gap-2.5">
              {formats.map((f, i) => (
                <motion.div
                  key={f.name}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.06, duration: 0.4 }}
                  whileHover={{ y: -3, boxShadow: '0 6px 18px rgba(30,42,82,0.1)' }}
                  className="flex cursor-default items-center gap-2 rounded-lg border border-[#eceef6] bg-white px-2.5 py-2"
                >
                  <f.icon size={18} style={{ color: f.color }} className="shrink-0" />
                  <div className="min-w-0 leading-tight">
                    <p className="text-[12.5px] font-bold text-ink">{f.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-[#9aa0b8]">{f.ext}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* 或 */}
        <motion.p variants={rise} className="my-2 text-center text-[12.5px] font-semibold text-[#9aa0b8]">
          或
        </motion.p>

        {/* 链接输入区 */}
        <motion.div variants={rise}>
          <div className="flex items-center gap-1.5 text-[13.5px] font-bold text-ink">
            <LinkIcon size={15} className="text-[#4f46e5]" />
            输入文档链接
          </div>
          <div className="mt-2 flex gap-3">
            <input
              type="text"
              placeholder="粘贴文档链接（支持 PDF 链接、在线文档等）"
              className="h-11 flex-1 rounded-xl border border-[#dfe1f0] bg-white px-4 text-[14px] text-ink outline-none transition-all placeholder:text-[#a8adc4] focus:border-[#4f46e5] focus:ring-4 focus:ring-[#4f46e5]/10"
            />
            <motion.button
              whileHover={{ y: -2, boxShadow: '0 10px 28px rgba(99,68,229,0.4)' }}
              whileTap={{ scale: 0.97 }}
              className="btn-shine flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] px-5 text-[14px] font-bold text-white shadow-[0_6px_20px_rgba(99,68,229,0.3)]"
            >
              <Globe size={16} />
              解析链接
            </motion.button>
          </div>
          <p className="mt-2 text-[12px] text-[#9aa0b8]">支持 arXiv、Google Drive、OneDrive、GitHub、官网链接等</p>
        </motion.div>
      </div>
    </motion.div>
  )
}
