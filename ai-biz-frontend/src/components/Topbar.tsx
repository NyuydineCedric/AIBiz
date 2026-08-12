import { Bell } from 'lucide-react'
import type { User } from '../lib/api'

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function Topbar({ title, user }: { title: string; user: User }) {
  return (
    <header className="h-16 border-b border-ink-200 flex items-center justify-between px-6 bg-white shrink-0">
      <h1 className="text-lg font-semibold text-ink-900">{title}</h1>
      <div className="flex items-center gap-4">
        <button className="relative text-ink-500 hover:text-ink-700" aria-label="Notifications">
          <Bell size={20} />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold">
            {initials(user.full_name || user.email)}
          </div>
          <span className="text-sm font-medium text-ink-700 hidden sm:block">{user.full_name}</span>
        </div>
      </div>
    </header>
  )
}
