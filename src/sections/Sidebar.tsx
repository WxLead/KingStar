import { motion } from 'framer-motion'
import { Plus, LayoutList, BookOpen, Star, Languages, ScanSearch } from 'lucide-react'

function StarTLogo() {
  return (
    <div className="flex items-center gap-3.5 px-2">
      <motion.svg
        width="48"
        height="48"
        viewBox="0 0 40 40"
        fill="none"
        whileHover={{ rotate: 12, scale: 1.08 }}
        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
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
      <div className="leading-tight">
        <span className="font-display block text-[32px] text-ink">StarT</span>
        <span className="block text-[13px] font-medium tracking-wide text-[#9aa0b8]">论文解析 · 翻译 · 解读</span>
      </div>
    </div>
  )
}

function NavItem({
  icon,
  label,
  active,
  primary,
  badge,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  primary?: boolean
  badge?: string
}) {
  return (
    <motion.button
      whileHover={{ x: 3 }}
      className={`flex w-full items-center gap-3.5 rounded-xl px-4 py-3.5 text-[17px] font-semibold transition-colors duration-200 ${
        active
          ? 'bg-white text-[#4f46e5] shadow-sm'
          : primary
            ? 'text-[#4f46e5] hover:bg-white hover:shadow-sm'
            : 'text-ink-soft hover:bg-white hover:text-ink hover:shadow-sm'
      }`}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {badge && (
        <span className="rounded-full bg-[#eef0fb] px-2.5 py-0.5 text-[13px] font-bold text-[#6a70a0]">{badge}</span>
      )}
    </motion.button>
  )
}

/** 最近解析文件条目 */
function RecentFile({ name, meta, type }: { name: string; meta: string; type: 'pdf' | 'trans' }) {
  return (
    <motion.button
      whileHover={{ x: 3 }}
      className="flex w-full items-center gap-3.5 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-white"
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ${
          type === 'pdf' ? 'text-[#e23f2b]' : 'text-[#4f46e5]'
        }`}
      >
        {type === 'pdf' ? <ScanSearch size={20} /> : <Languages size={20} />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[16px] font-semibold text-ink">{name}</span>
        <span className="mt-0.5 block text-[14px] text-[#9aa0b8]">{meta}</span>
      </span>
    </motion.button>
  )
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
}
const item = {
  hidden: { opacity: 0, x: -18 },
  show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
}

export default function Sidebar() {
  return (
    <aside className="sticky top-0 flex h-screen w-[320px] shrink-0 flex-col self-start bg-[#f5f6fb] px-5 pb-6 pt-7">
      <motion.div variants={container} initial="hidden" animate="show" className="flex flex-1 flex-col">
        <motion.div variants={item}>
          <StarTLogo />
        </motion.div>

        {/* 功能导航 */}
        <motion.nav variants={item} className="mt-8 space-y-1.5">
          <NavItem icon={<Plus size={22} strokeWidth={2.5} />} label="新解析" primary />
          <NavItem icon={<LayoutList size={22} />} label="任务管理" active badge="3" />
          <NavItem icon={<BookOpen size={22} />} label="文献库" />
          <NavItem icon={<Star size={22} />} label="我的收藏" />
        </motion.nav>

        <motion.div variants={item} className="mx-1 my-5 border-t border-[#e4e6f0]" />

        {/* 最近解析 */}
        <motion.div variants={item}>
          <p className="mb-2 px-3.5 text-[14px] font-bold tracking-wider text-[#9aa0b8]">最近解析</p>
          <div className="space-y-1">
            <RecentFile name="Unified World Models Co…" meta="版面分析 · 15.7MB" type="pdf" />
            <RecentFile name="Attention Is All You Need" meta="已翻译 · 2.1MB" type="trans" />
            <RecentFile name="Scaling Laws for Neural…" meta="解读完成 · 4.8MB" type="trans" />
          </div>
        </motion.div>
      </motion.div>
    </aside>
  )
}
