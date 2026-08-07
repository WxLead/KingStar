import { Outlet } from 'react-router'
import { PanelLeft } from 'lucide-react'
import Sidebar from '@/features/layout/Sidebar'
import {
  SidebarChromeProvider,
  useSidebarChrome,
  useToggleSidebarShortcutLabel,
} from '@/features/layout/SidebarChrome'
import { UploadsProvider } from '@/features/uploads/UploadsContext'

function AppShell() {
  const { open, setOpen } = useSidebarChrome()
  const toggleLabel = useToggleSidebarShortcutLabel()

  return (
    <div className="flex h-screen overflow-hidden bg-white font-sans">
      <div
        className={`shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? 'w-[340px]' : 'w-0'
        }`}
      >
        <div className="h-full w-[340px]">
          <Sidebar />
        </div>
      </div>

      <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden p-10">
        {!open && (
          <button
            type="button"
            title={`展开侧边栏 (${toggleLabel})`}
            onClick={() => setOpen(true)}
            className="group absolute left-0 top-1/2 z-20 flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-r-xl border border-l-0 border-[#e4e6f0] bg-white text-[#4f46e5] shadow-[2px_0_12px_rgba(79,70,229,0.12)] transition hover:w-9 hover:bg-[#eef0fb] hover:shadow-[2px_0_16px_rgba(79,70,229,0.18)]"
          >
            <PanelLeft
              size={16}
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </button>
        )}

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[340px]"
          style={{
            backgroundImage: 'radial-gradient(circle, #d9dcee 1.4px, transparent 1.4px)',
            backgroundSize: '26px 26px',
            maskImage: 'linear-gradient(to top, black 30%, transparent)',
            WebkitMaskImage: 'linear-gradient(to top, black 30%, transparent)',
          }}
        />

        <div className="relative flex min-h-0 flex-1 flex-col [&>*]:min-h-0 [&>*]:flex-1">
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
        <AppShell />
      </SidebarChromeProvider>
    </UploadsProvider>
  )
}
