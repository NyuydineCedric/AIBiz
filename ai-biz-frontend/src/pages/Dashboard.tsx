import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, CheckCircle2, Upload } from 'lucide-react'
import KpiCard from '../components/KpiCard'
import RevenueChart from '../components/RevenueChart'
import RegionChart from '../components/RegionChart'
import * as api from '../lib/api'

const cardStyle: Record<string, string> = {
  High: 'bg-rose-50 border-rose-100',
  Medium: 'bg-amber-50 border-amber-100',
}
const badgeStyle: Record<string, string> = {
  High: 'text-rose-700 bg-rose-100',
  Medium: 'text-amber-700 bg-amber-100',
}

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
            {summary?.executive_summary || 'Upload a business report to see KPIs, risks, and recommendations here.'}
          </p>
          <button
            onClick={() => navigate('/app/upload')}
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            Upload data
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {summary.kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 mb-6 flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center shrink-0">
          <Zap size={16} className="text-white" />
        </div>
        <div>
          <p className="text-xs font-semibold text-brand-700 mb-1">AI executive summary</p>
          <p className="text-sm text-ink-700 leading-relaxed">{summary.executive_summary}</p>
        </div>
      </div>

      {(summary.revenue_trend.labels.length > 0 || summary.region_breakdown.labels.length > 0) && (
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          {summary.revenue_trend.labels.length > 0 && (
            <div className="lg:col-span-2 bg-white rounded-xl border border-ink-200 p-5">
              <p className="text-sm font-semibold text-ink-900 mb-4">Revenue trend</p>
              <RevenueChart series={summary.revenue_trend} />
            </div>
          )}
          {summary.region_breakdown.labels.length > 0 && (
            <div className="bg-white rounded-xl border border-ink-200 p-5">
              <p className="text-sm font-semibold text-ink-900 mb-4">Revenue by region</p>
              <RegionChart series={summary.region_breakdown} />
            </div>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-ink-200 p-5">
          <p className="text-sm font-semibold text-ink-900 mb-4">Detected risks</p>
          {summary.risks.length === 0 ? (
            <p className="text-sm text-ink-500">No significant risks detected in this dataset.</p>
          ) : (
            <div className="space-y-3">
              {summary.risks.map((r) => (
                <div key={r.id} className={`flex items-start gap-3 p-3 rounded-lg border ${cardStyle[r.severity] ?? 'bg-ink-50 border-ink-100'}`}>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${badgeStyle[r.severity] ?? 'text-ink-700 bg-ink-100'}`}>
                    {r.severity}
                  </span>
                  <p className="text-sm text-ink-700">{r.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-ink-200 p-5">
          <p className="text-sm font-semibold text-ink-900 mb-4">AI recommendations</p>
          {summary.recommendations.length === 0 ? (
            <p className="text-sm text-ink-500">No recommendations yet.</p>
          ) : (
            <div className="space-y-3">
              {summary.recommendations.map((r) => (
                <div key={r.id} className="flex items-start gap-3 p-3 rounded-lg bg-teal-50 border border-teal-100">
                  <CheckCircle2 size={16} className="text-teal-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-ink-700">{r.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
