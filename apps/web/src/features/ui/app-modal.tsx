import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type AlertOpts = {
  title?: string
  description: string
  confirmLabel?: string
}

type ConfirmOpts = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive confirm (delete / clear). */
  danger?: boolean
}

type PromptOpts = {
  title: string
  description?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Allow empty string submit (e.g. annotation note). */
  allowEmpty?: boolean
  multiline?: boolean
}

type ModalState =
  | { kind: 'alert'; opts: AlertOpts; resolve: () => void }
  | { kind: 'confirm'; opts: ConfirmOpts; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; opts: PromptOpts; resolve: (value: string | null) => void }

type AppModalApi = {
  alert: (opts: string | AlertOpts) => Promise<void>
  confirm: (opts: ConfirmOpts) => Promise<boolean>
  prompt: (opts: PromptOpts) => Promise<string | null>
}

const AppModalContext = createContext<AppModalApi | null>(null)

/** Imperative handle set by the provider (usable outside React components). */
let modalApi: AppModalApi | null = null

function getApi(): AppModalApi {
  if (!modalApi) {
    throw new Error('AppModalProvider is not mounted')
  }
  return modalApi
}

export function appAlert(opts: string | AlertOpts): Promise<void> {
  return getApi().alert(opts)
}

export function appConfirm(opts: ConfirmOpts): Promise<boolean> {
  return getApi().confirm(opts)
}

export function appPrompt(opts: PromptOpts): Promise<string | null> {
  return getApi().prompt(opts)
}

const btnBase =
  'inline-flex h-10 items-center justify-center rounded-xl px-4 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40'

const btnGhost = `${btnBase} border border-[#e4e6f0] bg-white text-[#6a70a0] hover:border-[#c7c9ef] hover:text-[#4f46e5]`
const btnPrimary = `${btnBase} bg-[#4f46e5] text-white hover:bg-[#4338ca]`
const btnDanger = `${btnBase} bg-[#dc2626] text-white hover:bg-[#b91c1c]`

function ModalShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children?: ReactNode
  footer: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-2xl border-[#e8e9f4] bg-white p-0 shadow-[0_24px_64px_-24px_rgba(30,42,82,0.45)] sm:max-w-md"
      >
        <DialogHeader className="border-b border-[#eceef6] px-5 py-4 text-left">
          <DialogTitle className="text-[16px] font-bold tracking-wide text-ink">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="mt-1.5 text-[13px] leading-relaxed text-[#6a70a0]">
              {description}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>
        {children ? <div className="px-5 py-4">{children}</div> : null}
        <DialogFooter className="gap-2 border-t border-[#eceef6] bg-[#fafbff] px-5 py-3 sm:space-x-0">
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AppModalProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalState | null>(null)
  const [promptValue, setPromptValue] = useState('')
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const queueRef = useRef<ModalState[]>([])

  const push = useCallback((next: ModalState) => {
    setModal((cur) => {
      if (cur) {
        queueRef.current.push(next)
        return cur
      }
      return next
    })
  }, [])

  const closeCurrent = useCallback(() => {
    setModal(() => {
      const next = queueRef.current.shift() ?? null
      return next
    })
  }, [])

  const api = useMemo<AppModalApi>(
    () => ({
      alert: (opts) =>
        new Promise<void>((resolve) => {
          push({
            kind: 'alert',
            opts: typeof opts === 'string' ? { description: opts } : opts,
            resolve,
          })
        }),
      confirm: (opts) =>
        new Promise<boolean>((resolve) => {
          push({ kind: 'confirm', opts, resolve })
        }),
      prompt: (opts) =>
        new Promise<string | null>((resolve) => {
          push({ kind: 'prompt', opts, resolve })
        }),
    }),
    [push],
  )

  useEffect(() => {
    modalApi = api
    return () => {
      if (modalApi === api) modalApi = null
    }
  }, [api])

  useEffect(() => {
    if (modal?.kind === 'prompt') {
      setPromptValue(modal.opts.defaultValue ?? '')
      window.requestAnimationFrame(() => {
        inputRef.current?.focus()
        if (inputRef.current && 'select' in inputRef.current) {
          inputRef.current.select()
        }
      })
    }
  }, [modal])

  const open = Boolean(modal)

  const onOpenChange = (next: boolean) => {
    if (next || !modal) return
    if (modal.kind === 'alert') modal.resolve()
    else if (modal.kind === 'confirm') modal.resolve(false)
    else modal.resolve(null)
    closeCurrent()
  }

  return (
    <AppModalContext.Provider value={api}>
      {children}
      {modal?.kind === 'alert' ? (
        <ModalShell
          open={open}
          onOpenChange={onOpenChange}
          title={modal.opts.title || '提示'}
          description={modal.opts.description}
          footer={
            <button
              type="button"
              className={cn(btnPrimary, 'min-w-[88px]')}
              onClick={() => {
                modal.resolve()
                closeCurrent()
              }}
            >
              {modal.opts.confirmLabel || '知道了'}
            </button>
          }
        />
      ) : null}
      {modal?.kind === 'confirm' ? (
        <ModalShell
          open={open}
          onOpenChange={onOpenChange}
          title={modal.opts.title}
          description={modal.opts.description}
          footer={
            <>
              <button
                type="button"
                className={cn(btnGhost, 'min-w-[88px]')}
                onClick={() => {
                  modal.resolve(false)
                  closeCurrent()
                }}
              >
                {modal.opts.cancelLabel || '取消'}
              </button>
              <button
                type="button"
                className={cn(modal.opts.danger ? btnDanger : btnPrimary, 'min-w-[88px]')}
                onClick={() => {
                  modal.resolve(true)
                  closeCurrent()
                }}
              >
                {modal.opts.confirmLabel || '确认'}
              </button>
            </>
          }
        />
      ) : null}
      {modal?.kind === 'prompt' ? (
        <ModalShell
          open={open}
          onOpenChange={onOpenChange}
          title={modal.opts.title}
          description={modal.opts.description}
          footer={
            <>
              <button
                type="button"
                className={cn(btnGhost, 'min-w-[88px]')}
                onClick={() => {
                  modal.resolve(null)
                  closeCurrent()
                }}
              >
                {modal.opts.cancelLabel || '取消'}
              </button>
              <button
                type="button"
                className={cn(btnPrimary, 'min-w-[88px]')}
                disabled={!modal.opts.allowEmpty && !promptValue.trim()}
                onClick={() => {
                  modal.resolve(promptValue)
                  closeCurrent()
                }}
              >
                {modal.opts.confirmLabel || '确定'}
              </button>
            </>
          }
        >
          {modal.opts.multiline ? (
            <textarea
              ref={(el) => {
                inputRef.current = el
              }}
              value={promptValue}
              placeholder={modal.opts.placeholder}
              rows={4}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  if (modal.opts.allowEmpty || promptValue.trim()) {
                    modal.resolve(promptValue)
                    closeCurrent()
                  }
                }
              }}
              className="w-full resize-none rounded-xl border border-[#e4e6f0] bg-white px-3 py-2.5 text-[14px] text-ink outline-none transition placeholder:text-[#b0b5c9] focus:border-[#c7c9ef] focus:ring-2 focus:ring-[#eef0fb]"
            />
          ) : (
            <input
              ref={(el) => {
                inputRef.current = el
              }}
              value={promptValue}
              placeholder={modal.opts.placeholder}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                if (modal.opts.allowEmpty || promptValue.trim()) {
                  modal.resolve(promptValue)
                  closeCurrent()
                }
              }}
              className="h-10 w-full rounded-xl border border-[#e4e6f0] bg-white px-3 text-[14px] text-ink outline-none transition placeholder:text-[#b0b5c9] focus:border-[#c7c9ef] focus:ring-2 focus:ring-[#eef0fb]"
            />
          )}
        </ModalShell>
      ) : null}
    </AppModalContext.Provider>
  )
}

export function useAppModal(): AppModalApi {
  const ctx = useContext(AppModalContext)
  if (!ctx) throw new Error('useAppModal must be used within AppModalProvider')
  return ctx
}
