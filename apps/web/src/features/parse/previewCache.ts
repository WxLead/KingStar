import { fetchUploadFile } from '@/services/api'

const blobCache = new Map<string, Blob>()
const blobInflight = new Map<string, Promise<Blob>>()

/** Deduped upload file fetch with in-memory cache (avoids re-download on switch). */
export async function getCachedUploadBlob(uploadId: string): Promise<Blob> {
  const hit = blobCache.get(uploadId)
  if (hit) return hit

  const pending = blobInflight.get(uploadId)
  if (pending) return pending

  const promise = fetchUploadFile(uploadId)
    .then((blob) => {
      blobCache.set(uploadId, blob)
      blobInflight.delete(uploadId)
      return blob
    })
    .catch((err) => {
      blobInflight.delete(uploadId)
      throw err
    })

  blobInflight.set(uploadId, promise)
  return promise
}

export function invalidateUploadBlob(uploadId: string): void {
  blobCache.delete(uploadId)
  blobInflight.delete(uploadId)
}

export function clearUploadBlobCache(): void {
  blobCache.clear()
  blobInflight.clear()
}
