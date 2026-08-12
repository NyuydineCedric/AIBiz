import { useEffect, useState } from 'react'
import * as api from '../lib/api'
import { useAuth } from '../context/AuthContext'

type Tab = 'profile' | 'org' | 'notif' | 'integ'

const tabs: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'org', label: 'Organization' },
  { id: 'notif', label: 'Notifications' },
  { id: 'integ', label: 'Integrations' },
]

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function ProfileTab() {
  const { user } = useAuth()
  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      await api.updateProfile({ full_name: fullName, email })
      setMessage('Saved.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <p className="text-sm font-semibold text-ink-900 mb-4">Profile</p>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-lg">
          {initials(fullName || email || 'U')}
        </div>
        <button className="text-xs font-semibold border border-ink-200 rounded-lg px-3 py-1.5 hover:bg-ink-50">
          Change photo
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 max-w-lg">
        <div>
          <label className="text-xs font-medium text-ink-700 block mb-1.5">Full name</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full border border-ink-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-ink-700 block mb-1.5">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-ink-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>
      {message && <p className="text-xs text-ink-500 mt-3">{message}</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
      >
        {saving ? 'Saving...' : 'Save changes'}
      </button>
    </div>
  )
}

function OrganizationTab() {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    api
      .getOrganization()
      .then((org) => {
        setName(org.name)
        setIndustry(org.industry)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      await api.updateOrganization({ name, industry })
      setMessage('Saved.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save organization.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-ink-500">Loading...</p>

  return (
    <div>
      <p className="text-sm font-semibold text-ink-900 mb-4">Organization</p>
      <div className="grid sm:grid-cols-2 gap-4 max-w-lg mb-6">
        <div>
          <label className="text-xs font-medium text-ink-700 block mb-1.5">Company name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-ink-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-ink-700 block mb-1.5">Industry</label>
          <input value={industry} onChange={(e) => setIndustry(e.target.value)} className="w-full border border-ink-300 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      {message && <p className="text-xs text-ink-500 mb-3">{message}</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="mb-6 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
      >
        {saving ? 'Saving...' : 'Save changes'}
      </button>
      <p className="text-xs font-medium text-ink-700 mb-2">Team members</p>
      <div className="border border-ink-200 rounded-lg divide-y divide-ink-100">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-sm text-ink-700">{user?.email}</span>
          <span className="text-xs text-ink-500 capitalize">{user?.role}</span>
        </div>
      </div>
    </div>
  )
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState<api.NotificationPreferences | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getNotifications().then(setPrefs).finally(() => setLoading(false))
  }, [])

  const toggle = async (key: keyof api.NotificationPreferences) => {
    if (!prefs) return
    const updated = { ...prefs, [key]: !prefs[key] }
    setPrefs(updated)
    try {
      await api.updateNotifications({ [key]: updated[key] })
    } catch {
      setPrefs(prefs)
    }
  }

  if (loading || !prefs) return <p className="text-sm text-ink-500">Loading...</p>

  return (
    <div>
      <p className="text-sm font-semibold text-ink-900 mb-4">Notifications</p>
      <div className="space-y-3 max-w-md">
        <label className="flex items-center justify-between py-2">
          <span className="text-sm text-ink-700">Risk alerts</span>
          <input type="checkbox" checked={prefs.risk_alerts} onChange={() => toggle('risk_alerts')} className="rounded border-ink-300" />
        </label>
        <label className="flex items-center justify-between py-2">
          <span className="text-sm text-ink-700">Weekly report emails</span>
          <input
            type="checkbox"
            checked={prefs.weekly_report_emails}
            onChange={() => toggle('weekly_report_emails')}
            className="rounded border-ink-300"
          />
        </label>
        <label className="flex items-center justify-between py-2">
          <span className="text-sm text-ink-700">Forecast updates</span>
          <input
            type="checkbox"
            checked={prefs.forecast_updates}
            onChange={() => toggle('forecast_updates')}
            className="rounded border-ink-300"
          />
        </label>
      </div>
    </div>
  )
}

function IntegrationsTab() {
  return (
    <div>
      <p className="text-sm font-semibold text-ink-900 mb-4">Integrations</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="border border-ink-200 rounded-lg p-4 flex items-center justify-between">
          <span className="text-sm font-medium text-ink-700">Google Sheets</span>
          <button className="text-xs font-semibold border border-ink-200 rounded-lg px-3 py-1.5 hover:bg-ink-50">Connect</button>
        </div>
        <div className="border border-ink-200 rounded-lg p-4 flex items-center justify-between">
          <span className="text-sm font-medium text-ink-700">QuickBooks</span>
          <button className="text-xs font-semibold border border-ink-200 rounded-lg px-3 py-1.5 hover:bg-ink-50">Connect</button>
        </div>
      </div>
    </div>
  )
}

export default function Settings() {
  const [active, setActive] = useState<Tab>('profile')

  return (
    <div className="p-6">
      <div className="flex gap-6">
        <div className="w-48 shrink-0 space-y-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`w-full text-left text-sm font-medium px-3 py-2 rounded-lg ${
                active === t.id ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 bg-white rounded-xl border border-ink-200 p-6">
          {active === 'profile' && <ProfileTab />}
          {active === 'org' && <OrganizationTab />}
          {active === 'notif' && <NotificationsTab />}
          {active === 'integ' && <IntegrationsTab />}
        </div>
      </div>
    </div>
  )
}
