import type { ReactNode } from 'react'

/** Compact hover action icon matching CopyTextButton. */
export function MessageIconButton({
  title,
  onClick,
  disabled,
  children,
  className = '',
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-[#6a70a0] transition hover:bg-[#f3f4fb] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c7d2fe] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  )
}
