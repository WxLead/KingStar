import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { prepareAiChatMarkdown } from '@/features/parse/markdownMath'

export function AgentMarkdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const prepared = useMemo(() => {
    const raw = text || (streaming ? '_正在思考…_' : '')
    return prepareAiChatMarkdown(raw)
  }, [text, streaming])

  return (
    <div
      className={`ai-chat-md md-render select-text text-[14px] leading-[1.65] text-ink ${streaming ? 'opacity-95' : ''}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: 'ignore' }]]}
      >
        {prepared}
      </ReactMarkdown>
      {streaming && text ? (
        <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-[#4176e6] align-[-0.1em]" />
      ) : null}
    </div>
  )
}
