import Sidebar from '@/sections/Sidebar'
import ParseCard from '@/sections/ParseCard'

export default function Home() {
  return (
    <div className="flex h-screen overflow-hidden bg-white font-sans">
      <Sidebar />

      <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden p-8">
        {/* 底部点阵纹理 */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[300px]"
          style={{
            backgroundImage: 'radial-gradient(circle, #d9dcee 1.2px, transparent 1.2px)',
            backgroundSize: '22px 22px',
            maskImage: 'linear-gradient(to top, black 30%, transparent)',
            WebkitMaskImage: 'linear-gradient(to top, black 30%, transparent)',
          }}
        />

        <div className="relative flex flex-1 flex-col [&>*]:flex-1">
          <ParseCard />
        </div>
      </main>
    </div>
  )
}
