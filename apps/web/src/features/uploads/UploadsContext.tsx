import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  createTask,
  deleteUpload,
  listUploads,
  translateTask,
  uploadFile,
  type UploadItem,
} from '@/services/api'
import { invalidateUploadBlob } from '@/features/parse/previewCache'

type UploadsContextValue = {
  items: UploadItem[]
  loading: boolean
  error: string | null
  busyId: string | null
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  refresh: () => Promise<void>
  upload: (file: File) => Promise<UploadItem>
  remove: (uploadId: string) => Promise<void>
  parseLayout: (
    uploadId: string,
    opts?: { parse_backend?: string; server_url?: string | null },
  ) => Promise<string>
  /** Prefer translating an existing parsed task; falls back to full parse+translate. */
  translateOneClick: (
    uploadId: string,
    opts?: { parse_backend?: string; server_url?: string | null; task_id?: string | null },
  ) => Promise<string>
}

const UploadsContext = createContext<UploadsContextValue | null>(null)

export function UploadsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await listUploads()
      setItems(data.items)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法加载文件列表')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const upload = useCallback(
    async (file: File) => {
      const item = await uploadFile(file)
      await refresh()
      setSelectedId(item.upload_id)
      return item
    },
    [refresh],
  )

  const remove = useCallback(
    async (uploadId: string) => {
      setBusyId(uploadId)
      try {
        await deleteUpload(uploadId)
        invalidateUploadBlob(uploadId)
        if (selectedId === uploadId) setSelectedId(null)
        await refresh()
      } finally {
        setBusyId(null)
      }
    },
    [refresh, selectedId],
  )

  const parseLayout = useCallback(
    async (uploadId: string, opts?: { parse_backend?: string; server_url?: string | null }) => {
      setBusyId(uploadId)
      try {
        const task = await createTask({
          upload_id: uploadId,
          translate: false,
          parse_backend: opts?.parse_backend,
          server_url: opts?.server_url,
        })
        await refresh()
        return task.task_id
      } finally {
        setBusyId(null)
      }
    },
    [refresh],
  )

  const translateOneClick = useCallback(
    async (
      uploadId: string,
      opts?: { parse_backend?: string; server_url?: string | null; task_id?: string | null },
    ) => {
      setBusyId(uploadId)
      try {
        const item = items.find((i) => i.upload_id === uploadId)
        const stage = item?.pipeline_stage
        const existingTaskId =
          opts?.task_id ||
          (stage === 'parsed' || stage === 'completed' || stage === 'failed'
            ? item?.last_task_id
            : item?.last_status === 'done' || item?.last_status === 'failed'
              ? item.last_task_id
              : null)

        if (existingTaskId) {
          const task = await translateTask(existingTaskId)
          await refresh()
          return task.task_id
        }

        // No parsed document yet — full pipeline (parse + translate)
        const task = await createTask({
          upload_id: uploadId,
          translate: true,
          parse_backend: opts?.parse_backend,
          server_url: opts?.server_url,
        })
        await refresh()
        return task.task_id
      } finally {
        setBusyId(null)
      }
    },
    [items, refresh],
  )

  const value = useMemo(
    () => ({
      items,
      loading,
      error,
      busyId,
      selectedId,
      setSelectedId,
      refresh,
      upload,
      remove,
      parseLayout,
      translateOneClick,
    }),
    [
      items,
      loading,
      error,
      busyId,
      selectedId,
      refresh,
      upload,
      remove,
      parseLayout,
      translateOneClick,
    ],
  )

  return <UploadsContext.Provider value={value}>{children}</UploadsContext.Provider>
}

export function useUploads() {
  const ctx = useContext(UploadsContext)
  if (!ctx) throw new Error('useUploads must be used within UploadsProvider')
  return ctx
}
