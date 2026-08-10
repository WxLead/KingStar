/** Literature text annotations (MD / 译文). */

export type AnnotationSource = 'md' | 'zh'

export type Annotation = {
  id: string
  source: AnnotationSource
  quote: string
  prefix: string
  suffix: string
  note: string
  color: 'yellow' | 'green' | 'blue' | 'pink'
  createdAt: number
}

export type AnnotationsDoc = {
  uploadId: string
  items: Annotation[]
  updatedAt: number
}

export function newAnnotationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
