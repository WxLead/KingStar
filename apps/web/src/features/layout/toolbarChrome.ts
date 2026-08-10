/** Shared chrome for page / section / filter toolbars across sidebar pages. */

export const toolbarSurface =
  'relative shrink-0 border-b border-[#e6e8f4] bg-[#f5f6fc]/95'

/** Page-level header row (我的文献 / 任务管理 / …) */
export const pageToolbarInner =
  'relative flex h-14 items-center justify-between gap-3 px-5'

/** Section-level header row (最近阅读 / 全部文献) */
export const sectionToolbarInner =
  'relative flex h-12 items-center justify-between gap-3 px-4'

/** Filter strip under section / page headers */
export const filterToolbarInner =
  'relative z-30 flex h-12 items-center gap-2 px-4'

export const toolbarIconBox =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-white text-[#4f46e5] shadow-sm ring-1 ring-[#e4e6f2]'

export const toolbarCountBadge =
  'rounded-md bg-[#4f46e5]/10 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[#4f46e5]'
