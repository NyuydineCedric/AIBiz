import { Navigate, Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { useAuth } from '../context/AuthContext'

const titles: Record<string, string> = {
  '/app/dashboard': 'Dashboard',
  '/app/daily-entry': 'Daily log',
  '/app/upload': 'Upload data',
  '/app/ask': 'Ask a question',
  '/app/reports': 'Reports',
  '/app/settings': 'Settings',
  '/app/overview': 'Overview',
  '/app/forecast': 'Forecast',
}

export default function AppLayout() {
  const { pathname } = useLocation()
  const { user, loading } = useAuth()
  const title = titles[pathname] ?? 'Dashboard'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-ink-500">
        Loading...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={title} user={user} />
        <main className="flex-1 overflow-y-auto bg-ink-50">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
