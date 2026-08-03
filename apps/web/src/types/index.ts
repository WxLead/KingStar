/** Shared frontend types aligned with packages/shared + BFF contracts. */

export type TaskStatus = 'queued' | 'parsing' | 'translating' | 'done' | 'failed'

export const SUPPORTED_EXTENSIONS = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ppt',
  '.pptx',
  '.doc',
  '.docx',
  '.txt',
  '.md',
] as const
