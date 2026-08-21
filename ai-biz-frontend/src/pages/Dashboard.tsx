import { useEffect, useState } from 'react'
import { Zap, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import KpiPieChart from '../components/KpiPieChart'
import BusinessHealth from '../components/BusinessHealth'
import * as api from '../lib/api'

export default function Dashboard() {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<api.DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .getDashboardSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="p-6 text-sm text-ink-500">Loading dashboard...</div>
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-4 py-3">{error}</div>
      </div>
    )
  }

  if (!summary || !summary.has_data) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl border border-dashed border-ink-300 p-12 text-center">
          <Upload size={36} className="text-brand-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-ink-800 mb-1">No data yet</p>
          <p className="text-sm text-ink-500 mb-5">
            {summary?.executive_summary ||
              'Log a day of sales/purchases, or upload a business report, to see KPIs and an AI summary here.'}
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => navigate('/app/daily-entry')}
              className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              Log today's data
            </button>
            <button
              onClick={() => navigate('/app/upload')}
              className="bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              Upload a file instead
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 flex items-start gap-3 mb-6">
        <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center shrink-0">
          <Zap size={16} className="text-white" />
        </div>
        <div>
          <p className="text-xs font-semibold text-brand-700 mb-1">AI executive summary</p>
          <p className="text-sm text-ink-700 leading-relaxed">{summary.executive_summary}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-ink-200 p-6">
        <p className="text-sm font-semibold text-ink-900 mb-4">Key metrics</p>
        <KpiPieChart kpis={summary.kpis} />
        <BusinessHealth kpis={summary.kpis} risks={summary.risks} />
      </div>
    </div>
  )
}
