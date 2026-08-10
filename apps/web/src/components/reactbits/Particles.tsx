import { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  a: number
}

type ParticlesProps = {
  className?: string
  /** Soft density control; higher = fewer particles. Default 14000. */
  density?: number
  maxCount?: number
  linkDistance?: number
  color?: string
}

/** Lightweight linked-particle canvas background. */
export default function Particles({
  className = '',
  density = 14000,
  maxCount = 56,
  linkDistance = 120,
  color = '99, 102, 241',
}: ParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let particles: Particle[] = []
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = canvas
      if (w <= 0 || h <= 0) return
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(maxCount, Math.max(18, Math.floor((w * h) / density)))
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: reduceMotion ? 0 : (Math.random() - 0.5) * 0.28,
        vy: reduceMotion ? 0 : (Math.random() - 0.5) * 0.28,
        r: 1 + Math.random() * 1.6,
        a: 0.22 + Math.random() * 0.28,
      }))
    }

    const drawFrame = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)

      if (!reduceMotion) {
        for (const p of particles) {
          p.x += p.vx
          p.y += p.vy
          if (p.x < 0 || p.x > w) p.vx *= -1
          if (p.y < 0 || p.y > h) p.vy *= -1
        }
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.hypot(dx, dy)
          if (dist < linkDistance) {
            const alpha = (1 - dist / linkDistance) * 0.16
            ctx.strokeStyle = `rgba(${color}, ${alpha})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }

      for (const p of particles) {
        ctx.fillStyle = `rgba(${color}, ${p.a})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const tick = () => {
      drawFrame()
      if (!reduceMotion) raf = requestAnimationFrame(tick)
    }

    resize()
    tick()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [color, density, linkDistance, maxCount])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none h-full w-full ${className}`}
    />
  )
}
