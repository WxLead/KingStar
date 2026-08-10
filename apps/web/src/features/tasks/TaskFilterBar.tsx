import { CircleDot, ListChecks, LayoutList, SlidersHorizontal, X } from 'lucide-react'
import {
  filterToolbarInner,
  toolbarIconBox,
  toolbarSurface,
} from '@/features/layout/toolbarChrome'
import { cn } from '@/lib/utils'

export type TaskFilter = 'all' | 'busy' | 'ready'

const chipBase =
  'inline-flex h-[30px] items-center gap-1.5 rounded-[10px] px-2.5 text-[12px] font-semibold tracking-wide transition duration-150'

const OPTIONS: Array<{
  id: TaskFilter
  label: string
  icon: typeof LayoutList
}> = [
  { id: 'all', label: '全部', icon: LayoutList },
  { id: 'busy', label: '进行中', icon: CircleDot },
  { id: 'ready', label: '已就绪', icon: ListChecks },
]

export default function TaskFilterBar({
  filter,
  onChange,
  counts,
}: {
  filter: TaskFilter
  onChange: (next: TaskFilter) => void
  counts: { all: number; busy: number; ready: number }
}) {
  const active = filter !== 'all'
  const countOf = (id: TaskFilter) => counts[id]

  return (
    <div className={toolbarSurface}>
      <div className={filterToolbarInner}>
        <div className="mr-0.5 flex shrink-0 items-center gap-1.5 text-[#8b91b3]">
          <span className={toolbarIconBox}>
            <SlidersHorizontal size={13} strokeWidth={2.25} />
          </span>
          <span className="hidden text-[11px] font-bold tracking-[0.08em] text-[#9aa0b8] sm:inline">
            筛选
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {OPTIONS.map((opt) => {
            const selected = filter === opt.id
            const Icon = opt.icon
            const n = countOf(opt.id)
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange(opt.id)}
                className={cn(
                  chipBase,
                  selected
                    ? 'bg-[#4f46e5] text-white shadow-[0_4px_12px_-4px_rgba(79,70,229,0.55)]'
                    : 'bg-white text-[#5a6086] ring-1 ring-[#e3e6f3] hover:bg-[#f7f8fd] hover:text-[#4f46e5] hover:ring-[#cfd3ef]',
                )}
              >
                <Icon size={12} />
                {opt.label}
                <span
                  className={cn(
                    'min-w-[16px] rounded-md px-1 py-px text-center text-[10px] font-bold tabular-nums leading-none',
                    selected ? 'bg-white/20 text-white' : 'bg-[#eef0fb] text-[#4f46e5]',
                  )}
                >
                  {n}
                </span>
              </button>
            )
          })}
        </div>

        {active ? (
          <button
            type="button"
            onClick={() => onChange('all')}
            className="inline-flex h-[30px] shrink-0 items-center gap-1 rounded-[10px] px-2 text-[12px] font-semibold text-[#9aa0b8] transition hover:bg-white hover:text-[#5a6086] hover:ring-1 hover:ring-[#e3e6f3]"
          >
            <X size={12} />
            清除
          </button>
        ) : null}
      </div>
    </div>
  )
}
