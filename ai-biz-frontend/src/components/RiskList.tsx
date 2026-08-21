import { useNavigate } from 'react-router-dom'
import { ShieldCheck, AlertTriangle, AlertCircle, Sparkles } from 'lucide-react'
import type { Insight } from '../lib/api'

const SEVERITY_STYLE: Record<string, { icon: typeof AlertTriangle; badge: string }> = {
  High: { icon: AlertCircle, badge: 'text-rose-700 bg-rose-100' },
  Medium: { icon: AlertTriangle, badge: 'text-amber-700 bg-amber-100' },
  Low: { icon: AlertTriangle, badge: 'text-ink-500 bg-ink-100' },
}

export default function RiskList({ risks }: { risks: Insight[] }) {
  const navigate = useNavigate()

  const askAi = (risk: Insight) => {
    const question = `What should I do about this risk: "${risk.text}" Give me a practical solution.`
    navigate(`/app/ask?q=${encodeURIComponent(question)}`)
  }

  if (risks.length === 0) {
    return (
      <div className="bg-white border border-ink-200 rounded-xl p-4 flex items-center gap-3 mt-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-teal-50 text-teal-600">
          <ShieldCheck size={18} />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-900">No risks detected</p>
          <p className="text-xs text-ink-500">This dataset looks healthy right now.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-ink-200 rounded-xl mt-3 divide-y divide-ink-100">
      {risks.map((risk) => {
        const style = SEVERITY_STYLE[risk.severity] || SEVERITY_STYLE.Medium
        const Icon = style.icon
        return (
          <div key={risk.id} className="flex items-start gap-3 p-4">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${style.badge}`}>
              <Icon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full mb-1 ${style.badge}`}>
                {risk.severity}
              </span>
              <p className="text-sm text-ink-800 leading-snug">{risk.text}</p>
            </div>
            <button
              onClick={() => askAi(risk)}
              className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-100 rounded-full px-3 py-1.5 transition"
              title="Ask the AI for a solution to this risk"
            >
              <Sparkles size={13} />
              Ask AI
            </button>
          </div>
        )
      })}
    </div>
  )
}
