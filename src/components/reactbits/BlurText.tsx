import { motion } from 'framer-motion'

interface BlurTextProps {
  text: string
  className?: string
  delay?: number
  /** 按字拆分动画间隔 */
  stagger?: number
}

/** ReactBits 风格：文字逐字模糊浮入 */
export default function BlurText({ text, className = '', delay = 0, stagger = 0.05 }: BlurTextProps) {
  return (
    <span className={className} aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="inline-block"
          initial={{ opacity: 0, filter: 'blur(10px)', y: 16 }}
          animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
          transition={{ duration: 0.55, delay: delay + i * stagger, ease: [0.22, 1, 0.36, 1] }}
        >
          {ch === ' ' ? '\u00A0' : ch}
        </motion.span>
      ))}
    </span>
  )
}
