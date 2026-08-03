import { Outlet } from 'react-router'
import Sidebar from '@/features/layout/Sidebar'
import { UploadsProvider } from '@/features/uploads/UploadsContext'

export default function AppLayout() {
  return (
    <UploadsProvider>
      <div className="flex h-screen overflow-hidden bg-white font-sans">
        <Sidebar />

        <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden p-10">
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
    </UploadsProvider>
  )
}
