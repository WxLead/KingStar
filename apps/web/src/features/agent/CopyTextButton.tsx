import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyTextButton({
  text,
  className = '',
}: {
  text: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  if (!text.trim()) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      try {
        const el = document.createElement('textarea')
        el.value = text
        el.style.position = 'fixed'
        el.style.left = '-9999px'
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      } catch {
        /* clipboard blocked */
      }
    }
  }

  return (
    <button
      type="button"
      title={copied ? '已复制' : '复制'}
      onClick={(e) => {
        e.stopPropagation()
        void copy()
      }}
      className={`inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-[#6a70a0] transition hover:bg-[#f3f4fb] hover:text-ink ${className}`}
    >
      {copied ? <Check size={13} className="text-[#059669]" /> : <Copy size={13} />}
      {copied ? '已复制' : '复制'}
    </button>
  )
}
