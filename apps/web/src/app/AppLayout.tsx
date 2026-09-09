import { Outlet } from 'react-router'
import { PanelLeft } from 'lucide-react'
import Particles from '@/components/reactbits/Particles'
import Sidebar from '@/features/layout/Sidebar'
import {
  SidebarChromeProvider,
  useSidebarChrome,
  useToggleSidebarShortcutLabel,
} from '@/features/layout/SidebarChrome'
import { AppModalProvider } from '@/features/ui/app-modal'
import { UploadsProvider } from '@/features/uploads/UploadsContext'

function AppShell() {
  const { open, setOpen } = useSidebarChrome()
  const toggleLabel = useToggleSidebarShortcutLabel()

  return (
    <div className="flex h-screen overflow-hidden bg-[#f4f5fb] font-sans">
      <div
        className={`relative z-10 shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? 'w-[340px]' : 'w-0'
        }`}
      >
        <div className="h-full w-[340px]">
          <Sidebar />
        </div>
      </div>

      <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden p-10">
        {/* Atmosphere: soft washes + linked particles */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -left-24 -top-28 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.16)_0%,transparent_68%)]" />
          <div className="absolute -right-20 top-[18%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(14,165,233,0.12)_0%,transparent_70%)]" />
          <div className="absolute bottom-[-10%] left-[28%] h-[380px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.1)_0%,transparent_72%)]" />
          <div className="absolute inset-0 opacity-90">
            <Particles />
          </div>
          <div
            className="absolute inset-x-0 bottom-0 h-[280px] opacity-50"
            style={{
              backgroundImage: 'radial-gradient(circle, #c8cbe8 1.1px, transparent 1.1px)',
              backgroundSize: '28px 28px',
              maskImage: 'linear-gradient(to top, black 20%, transparent)',
              WebkitMaskImage: 'linear-gradient(to top, black 20%, transparent)',
            }}
          />
        </div>

        {!open && (
          <button
            type="button"
            title={`展开侧边栏 (${toggleLabel})`}
            onClick={() => setOpen(true)}
            className="group absolute left-0 top-1/2 z-20 flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-r-xl border border-l-0 border-[#e4e6f0] bg-white/90 text-[#4f46e5] shadow-[2px_0_12px_rgba(79,70,229,0.12)] backdrop-blur-sm transition hover:w-9 hover:bg-[#eef0fb] hover:shadow-[2px_0_16px_rgba(79,70,229,0.18)]"
          >
            <PanelLeft
              size={16}
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </button>
        )}

        <div className="relative z-10 flex min-h-0 flex-1 flex-col [&>*]:min-h-0 [&>*]:flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default function AppLayout() {
  return (
    <UploadsProvider>
      <SidebarChromeProvider>
        <AppModalProvider>
          <AppShell />
        </AppModalProvider>
      </SidebarChromeProvider>
    </UploadsProvider>
  )
}
