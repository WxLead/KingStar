import { motion } from 'framer-motion'
import {
  ArrowUpRight,
  BookMarked,
  FileSearch,
  Globe2,
  ListChecks,
  Sparkles,
} from 'lucide-react'

type Example = {
  title: string
  hint: string
  prompt: string
}

const EXAMPLES: Example[] = [
  {
    title: '检查引擎就绪',
    hint: 'MinerU · LLM',
    prompt: '检查 MinerU 和 LLM 是否就绪',
  },
  {
    title: '检索文献库',
    hint: '本地搜索',
    prompt: '在文献库搜索 transformer，列出最近几篇',
  },
  {
    title: '领域调研',
    hint: 'Web · 报告',
    prompt: '调研长上下文 Transformer 近期进展，写一份中文简报（先不要入库或解析）',
  },
  {
    title: '从 arXiv 导入',
    hint: '入库 · 解析',
    prompt: '把 https://arxiv.org/abs/1706.03762 入库并解析（先不翻译）',
  },
]

const CAPABILITIES = [
  { icon: Globe2, label: '网页检索' },
  { icon: BookMarked, label: '文献入库' },
  { icon: FileSearch, label: '版面解析' },
  { icon: ListChecks, label: '任务规划' },
] as const

const easeOut = [0.22, 1, 0.36, 1] as const

type Props = {
  onPick: (prompt: string) => void
}

export function AgentEmptyState({ onPick }: Props) {
  return (
    <div className="relative flex h-full min-h-0 flex-col items-center justify-center overflow-hidden px-5 py-6 text-center sm:px-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#f7f9fd]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_28%,rgba(65,118,230,0.10),transparent_58%)]"
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-8 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-[#4176e6]/[0.07] blur-3xl"
        animate={{ scale: [1, 1.12, 1], opacity: [0.45, 0.7, 0.45] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: easeOut }}
        className="relative"
      >
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          whileHover={{ scale: 1.06, rotate: 4 }}
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-[1.2rem] bg-gradient-to-br from-[#e8f0ff] to-[#dbe7ff] text-[#4176e6] shadow-[0_12px_28px_-14px_rgba(65,118,230,0.55)] ring-1 ring-[#c7d2fe]/60"
        >
          <Sparkles size={24} strokeWidth={1.75} />
        </motion.div>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08, ease: easeOut }}
        className="relative mt-4 font-display text-[20px] tracking-wide text-ink sm:text-[22px]"
      >
        从一条研究目标开始
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.14, ease: easeOut }}
        className="relative mt-1.5 max-w-md text-[13px] leading-relaxed text-[#6a70a0]"
      >
        助手可以检索网页、管理待办、调度子代理；入库与解析仅在你明确要求时执行。
      </motion.p>

      <motion.ul
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.06, delayChildren: 0.22 } },
        }}
        className="relative mt-4 flex flex-wrap items-center justify-center gap-2"
      >
        {CAPABILITIES.map(({ icon: Icon, label }) => (
          <motion.li
            key={label}
            variants={{
              hidden: { opacity: 0, y: 8 },
              show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: easeOut } },
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#e4e8f0] bg-white/80 px-2.5 py-1 text-[11px] font-medium text-[#5a6486] shadow-sm backdrop-blur-sm"
          >
            <Icon size={12} className="text-[#4176e6]" />
            {label}
          </motion.li>
        ))}
      </motion.ul>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.07, delayChildren: 0.32 } },
        }}
        className="relative mt-5 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {EXAMPLES.map((ex) => (
          <motion.button
            key={ex.title}
            type="button"
            variants={{
              hidden: { opacity: 0, y: 14 },
              show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeOut } },
            }}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onPick(ex.prompt)}
            className="group relative overflow-hidden rounded-2xl border border-[#e4e8f0] bg-white/90 px-4 py-3 text-left shadow-sm transition hover:border-[#c7d2fe] hover:shadow-[0_10px_24px_-16px_rgba(65,118,230,0.55)]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#4176e6]/[0.06] to-transparent opacity-0 transition group-hover:opacity-100"
            />
            <span className="relative flex items-start justify-between gap-2">
              <span>
                <span className="block text-[13px] font-semibold text-[#1e2a52]">{ex.title}</span>
                <span className="mt-0.5 block text-[11px] text-[#9aa0b8]">{ex.hint}</span>
              </span>
              <ArrowUpRight
                size={15}
                className="mt-0.5 shrink-0 text-[#c7d2fe] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#4176e6]"
              />
            </span>
            <span className="relative mt-2 line-clamp-2 text-[12px] leading-relaxed text-[#6a70a0]">
              {ex.prompt}
            </span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  )
}
