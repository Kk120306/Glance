import { DashboardProvider } from '@/components/DashboardProvider'
import { Sidebar } from '@/components/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </DashboardProvider>
  )
}
