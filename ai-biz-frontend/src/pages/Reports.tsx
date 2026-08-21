import { useEffect, useState } from 'react'
import { FileText, ShieldAlert, TrendingUp, BarChart3, Plus } from 'lucide-react'
import * as api from '../lib/api'

const iconMap: Record<string, { Icon: typeof FileText; color: string }> = {
  summary: { Icon: FileText, color: 'bg-brand-100 text-brand-600' },
  risk: { Icon: ShieldAlert, color: 'bg-rose-100 text-rose-600' },
  forecast: { Icon: TrendingUp, color: 'bg-teal-100 text-teal-600' },
  performance: { Icon: BarChart3, color: 'bg-amber-100 text-amber-600' },
}

const REPORT_TYPES: { value: string; label: string }[] = [
  { value: 'summary', label: 'Executive summary' },
  { value: 'risk', label: 'Risk assessment' },
  { value: 'forecast', label: 'Revenue forecast' },
  { value: 'performance', label: 'Performance summary' },
]

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Reports() {
  const [reports, setReports] = useState<api.Report[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [reportType, setReportType] = useState('summary')

  const loadReports = () => {
    api
      .listReports()
      .then(setReports)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load reports.'))
      .finally(() => setLoading(false))
  }

  useEffect(loadReports, [])

  const handleGenerate = async () => {
    setError('')
    setGenerating(true)
    try {
      await api.generateReport(reportType)
      loadReports()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report. Upload a dataset first.')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async (report: api.Report, format: 'pdf' | 'xlsx') => {
    try {
      await api.downloadReport(report.id, format, report.title)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.')
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <p className="text-sm text-ink-500">AI-generated executive reports and summaries</p>
        <div className="flex items-center gap-2">
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {REPORT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition flex items-center gap-2"
          >
            <Plus size={16} />
            {generating ? 'Generating...' : 'Generate report'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-4 py-3">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-ink-500">Loading reports...</p>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-ink-300 p-10 text-center text-sm text-ink-500">
          No reports yet. Upload a dataset, then generate your first report.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {reports.map((r) => {
            const { Icon, color } = iconMap[r.report_type] ?? iconMap.summary
            return (
              <div key={r.id} className="bg-white rounded-xl border border-ink-200 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
                    <Icon size={20} />
                  </div>
                  <span className="text-xs font-medium text-ink-500">{formatDate(r.created_at)}</span>
                </div>
                <p className="font-semibold text-ink-900 mb-1">{r.title}</p>
                <p className="text-sm text-ink-500 mb-4">{r.description}</p>
                <div className="flex gap-2">
                  <button
                    disabled={!r.has_pdf}
                    onClick={() => handleDownload(r, 'pdf')}
                    className="text-xs font-semibold border border-ink-200 rounded-lg px-3 py-1.5 hover:bg-ink-50 disabled:opacity-40"
                  >
                    Download PDF
                  </button>
                  <button
                    disabled={!r.has_xlsx}
                    onClick={() => handleDownload(r, 'xlsx')}
                    className="text-xs font-semibold border border-ink-200 rounded-lg px-3 py-1.5 hover:bg-ink-50 disabled:opacity-40"
                  >
                    Download Excel
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
