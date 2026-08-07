import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { rewriteMarkdownImageSrc } from '@/features/parse/markdownImages'
import { prepareMarkdown } from '@/features/parse/markdownMath'

export function MarkdownBody({ source, taskId }: { source: string; taskId?: string | null }) {
  const prepared = useMemo(() => prepareMarkdown(source), [source])
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeRaw, [rehypeKatex, { throwOnError: false, strict: 'ignore' }]]}
      components={{
        img: ({ src, alt, ...props }) => (
          <img
            {...props}
            src={rewriteMarkdownImageSrc(typeof src === 'string' ? src : undefined, taskId)}
            alt={alt ?? ''}
            loading="lazy"
            className="my-3 max-w-full rounded-lg bg-[#f6f7fc]"
          />
        ),
        table: ({ children, ...props }) => (
          <div className="md-table-wrap">
            <table {...props}>{children}</table>
          </div>
        ),
      }}
    >
      {prepared}
    </ReactMarkdown>
  )
}

export default function ReadingMarkdown({
  markdown,
  taskId,
  emptyHint,
}: {
  markdown: string
  taskId?: string | null
  emptyHint?: string
}) {
  if (!markdown.trim()) {
    return (
      <p className="px-8 py-16 text-center text-[15px] text-[#9aa0b8]">
        {emptyHint ?? '暂无内容'}
      </p>
    )
  }

  return (
    <article className="md-render mx-auto max-w-[720px] px-8 py-10 text-[16px] leading-[1.85] text-ink">
      <MarkdownBody source={markdown} taskId={taskId} />
    </article>
  )
}
