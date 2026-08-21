import type { LucideIcon } from 'lucide-react'

type Trend = 'up' | 'down' | 'warn'

const trendColor: Record<Trend, string> = {
  up: 'text-teal-600',
  down: 'text-rose-600',
  warn: 'text-amber-600',
}

const trendPrefix: Record<Trend, string> = {
  up: '▲ ',
  down: '▼ ',
  warn: '',
}

const iconBg: Record<Trend, string> = {
  up: 'bg-teal-50 text-teal-600',
  down: 'bg-rose-50 text-rose-600',
  warn: 'bg-amber-50 text-amber-600',
}

export default function KpiCard({
  label,
  value,
  change,
  trend,
  icon: Icon,
}: {
  label: string
  value: string
  change: string
  trend: Trend
  icon?: LucideIcon
}) {
  return (
    <div className="bg-white rounded-xl border border-ink-200 p-5 hover:border-ink-300 hover:shadow-sm transition">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium text-ink-500">{label}</p>
        {Icon && (
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBg[trend]}`}>
            <Icon size={14} />
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-ink-900">{value}</p>
      <p className={`text-xs font-medium mt-1 ${trendColor[trend]}`}>
        {trendPrefix[trend]}
        {change}
      </p>
    </div>
  )
}
