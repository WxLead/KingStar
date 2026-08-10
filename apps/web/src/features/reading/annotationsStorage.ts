/** Persist reading annotations: BFF SQLite + localStorage cache. */

import {
  getAnnotations,
  putAnnotations,
} from '@/services/api'
import type { Annotation, AnnotationsDoc } from '@/features/reading/annotationsTypes'

function cacheKey(uploadId: string) {
  return `start:reading-annotations:${uploadId}`
}

function readLocal(uploadId: string): AnnotationsDoc | null {
  try {
    const raw = localStorage.getItem(cacheKey(uploadId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as AnnotationsDoc
    if (!parsed || !Array.isArray(parsed.items)) return null
    return {
      uploadId,
      items: parsed.items,
      updatedAt: Number(parsed.updatedAt) || 0,
    }
  } catch {
    return null
  }
}

function writeLocal(doc: AnnotationsDoc) {
  try {
    localStorage.setItem(cacheKey(doc.uploadId), JSON.stringify(doc))
  } catch {
    /* ignore quota */
  }
}

export async function fetchAnnotations(uploadId: string): Promise<AnnotationsDoc> {
  try {
    const remote = await getAnnotations(uploadId)
    const doc: AnnotationsDoc = {
      uploadId,
      items: (remote.items || []) as Annotation[],
      updatedAt: remote.updated_at || 0,
    }
    writeLocal(doc)
    return doc
  } catch {
    return readLocal(uploadId) || { uploadId, items: [], updatedAt: 0 }
  }
}

export async function saveAnnotations(
  uploadId: string,
  items: Annotation[],
): Promise<{ ok: boolean; localOnly: boolean; updatedAt: number }> {
  const updatedAt = Date.now()
  const doc: AnnotationsDoc = { uploadId, items, updatedAt }
  writeLocal(doc)
  try {
    await putAnnotations(uploadId, { items, updated_at: updatedAt })
    return { ok: true, localOnly: false, updatedAt }
  } catch {
    return { ok: true, localOnly: true, updatedAt }
  }
}
