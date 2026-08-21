import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import RiskList from '../components/RiskList'
import * as api from '../lib/api'

export default function Risks() {
  const [summary, setSummary] = useState<api.DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .getDashboardSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load risks.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-ink-900 mb-1 flex items-center gap-2">
        <ShieldAlert size={20} /> Detected risks
      </h1>
      <p className="text-sm text-ink-500 mb-6">
        Click "Ask AI" on any risk for a practical solution — it'll also show up on the Forecast page.
      </p>

      {error && (
        <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-4 py-3">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-ink-500">Loading...</p>
      ) : !summary || !summary.has_data ? (
        <div className="bg-white rounded-xl border border-dashed border-ink-300 p-12 text-center">
          <p className="text-sm font-semibold text-ink-800 mb-1">No data yet</p>
          <p className="text-sm text-ink-500">
            Log a day of sales/purchases, or upload a business report, to see risks here.
          </p>
        </div>
      ) : (
        <RiskList risks={summary.risks} />
      )}
    </div>
  )
}
