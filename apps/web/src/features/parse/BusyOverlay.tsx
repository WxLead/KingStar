/** Playful busy overlay for translate / link / export — stays pinned while MD scrolls. */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

export type BusyKind = 'translate' | 'link' | 'export'

const COPY: Record<
  BusyKind,
  { title: string; hint: string; accent: string; soft: string; glow: string; track: string }
> = {
  translate: {
    title: '正在翻译中…',
    hint: '完成后将自动切换到译文',
    accent: '#6366f1',
    soft: '#818cf8',
    glow: 'rgba(99,102,241,0.28)',
    track: 'rgba(99,102,241,0.12)',
  },
  link: {
    title: '正在生成译文联动…',
    hint: '完成后可与左栏框选双向悬浮',
    accent: '#6366f1',
    soft: '#818cf8',
    glow: 'rgba(99,102,241,0.28)',
    track: 'rgba(99,102,241,0.12)',
  },
  export: {
    title: '正在导出 PDF…',
    hint: '排版渲染中，请稍候',
    accent: '#6366f1',
    soft: '#818cf8',
    glow: 'rgba(99,102,241,0.28)',
    track: 'rgba(99,102,241,0.12)',
  },
}

/** Bouncy star buddy — squash, hop, little wiggle (no external assets). */
function BounceBuddy({ accent, soft }: { accent: string; soft: string }) {
  return (
    <div className="relative mx-auto h-[5.5rem] w-28 select-none" aria-hidden>
      <motion.div
        className="absolute bottom-1 left-1/2 h-2.5 w-14 -translate-x-1/2 rounded-full"
        style={{ background: soft, opacity: 0.35, filter: 'blur(2px)' }}
        animate={{ scaleX: [1, 1.45, 1], opacity: [0.4, 0.18, 0.4] }}
        transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        className="absolute inset-x-0 top-0 flex justify-center"
        animate={{ y: [0, -20, 0] }}
        transition={{ duration: 0.9, repeat: Infinity, ease: [0.34, 1.4, 0.64, 1] }}
      >
        <motion.div
          animate={{
            scaleX: [1, 0.92, 1.06, 1],
            scaleY: [1, 1.1, 0.92, 1],
            rotate: [0, -8, 8, 0],
          }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
        >
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="34" r="22" fill={soft} opacity="0.2" />
            <path
              d="M32 8.5l5.4 14.2 15.1.6-11.8 9.5 4 14.6L32 39.2 19.3 47.4l4-14.6L11.5 23.3l15.1-.6L32 8.5z"
              fill={accent}
            />
            <circle cx="26.5" cy="30" r="2.1" fill="#fff" />
            <circle cx="37.5" cy="30" r="2.1" fill="#fff" />
            <circle cx="27.1" cy="30.4" r="0.85" fill="#1e1b4b" />
            <circle cx="38.1" cy="30.4" r="0.85" fill="#1e1b4b" />
            <path
              d="M28 36.2c1.4 1.8 6.6 1.8 8 0"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
              fill="none"
            />
            <ellipse cx="23" cy="33.5" rx="2.2" ry="1.3" fill="#fda4af" opacity="0.75" />
            <ellipse cx="41" cy="33.5" rx="2.2" ry="1.3" fill="#fda4af" opacity="0.75" />
          </svg>
        </motion.div>
      </motion.div>

      {[
        { x: 6, y: 10, d: 0 },
        { x: 98, y: 18, d: 0.25 },
        { x: 12, y: 48, d: 0.45 },
      ].map((s, i) => (
        <motion.span
          key={i}
          className="pointer-events-none absolute text-[11px]"
          style={{ left: `${s.x}%`, top: s.y, color: soft }}
          animate={{ opacity: [0, 1, 0], y: [4, -6, 4], scale: [0.6, 1.1, 0.6] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: s.d, ease: 'easeInOut' }}
        >
          ✦
        </motion.span>
      ))}
    </div>
  )
}

/**
 * Soft asymptotic progress when server ratio is missing; otherwise follow `ratio` (0–1).
 * Never sits at 100% until parent unmounts / ratio hits 1.
 */
function useDisplayProgress(ratio: number | null | undefined) {
  const [soft, setSoft] = useState(0.04)

  useEffect(() => {
    if (typeof ratio === 'number' && Number.isFinite(ratio)) {
      setSoft((prev) => Math.max(prev, Math.min(1, ratio)))
      return
    }
    const id = window.setInterval(() => {
      setSoft((p) => {
        // Ease toward ~90% without real signals
        const next = p + (0.9 - p) * 0.045
        return Math.min(0.92, next)
      })
    }, 400)
    return () => window.clearInterval(id)
  }, [ratio])

  useEffect(() => {
    setSoft(0.04)
  }, [])

  return Math.round(Math.min(100, Math.max(0, soft * 100)))
}

export default function BusyOverlay({
  kind,
  progressRatio,
  progressMessage,
}: {
  kind: BusyKind
  /** 0–1 from task.progress.ratio when available */
  progressRatio?: number | null
  progressMessage?: string | null
}) {
  const c = COPY[kind]
  const pct = useDisplayProgress(progressRatio)
  const hint = progressMessage?.trim() || c.hint

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center px-6"
      style={{
        background:
          'linear-gradient(160deg, rgba(250,250,255,0.92) 0%, rgba(238,242,255,0.88) 55%, rgba(245,243,255,0.9) 100%)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <motion.div
        className="pointer-events-none absolute h-40 w-40 rounded-full"
        style={{ background: c.glow, filter: 'blur(28px)', top: '28%', left: '18%' }}
        animate={{ x: [0, 18, 0], y: [0, -12, 0], opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute h-32 w-32 rounded-full"
        style={{ background: c.glow, filter: 'blur(24px)', bottom: '26%', right: '16%' }}
        animate={{ x: [0, -14, 0], y: [0, 10, 0], opacity: [0.4, 0.75, 0.4] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
      />

      <div
        className="relative flex w-[min(20rem,86vw)] flex-col items-center gap-3 rounded-3xl px-8 py-7"
        style={{
          background: 'rgba(255,255,255,0.72)',
          boxShadow: `0 12px 40px ${c.glow}, 0 1px 0 rgba(255,255,255,0.8) inset`,
          border: '1px solid rgba(255,255,255,0.9)',
        }}
      >
        <BounceBuddy accent={c.accent} soft={c.soft} />

        <motion.p
          className="text-[15px] font-semibold tracking-wide"
          style={{ color: c.accent }}
          animate={{ opacity: [0.75, 1, 0.75] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          {c.title}
        </motion.p>
        <p className="text-center text-[12px] leading-relaxed" style={{ color: c.soft }}>
          {hint}
        </p>

        {/* Progress bar */}
        <div className="mt-1 w-full">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold">
            <span style={{ color: c.soft }}>进度</span>
            <span style={{ color: c.accent }}>{pct}%</span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full"
            style={{ background: c.track }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <motion.div
              className="relative h-full rounded-full"
              style={{
                background: `linear-gradient(90deg, ${c.soft}, ${c.accent})`,
                width: `${pct}%`,
              }}
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 22 }}
            >
              <motion.span
                className="absolute inset-y-0 right-0 w-8 rounded-full"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55))',
                }}
                animate={{ opacity: [0.2, 0.85, 0.2] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
