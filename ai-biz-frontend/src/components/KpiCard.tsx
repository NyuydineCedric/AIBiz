type Trend = 'up' | 'down' | 'warn'

const trendColor: Record<Trend, string> = {
  up: 'text-teal-600',
  down: 'text-rose-600',
  warn: 'text-amber-600',
}

const trendPrefix: Record<Trend, string> = {
  up: '▲ ',
  down: '▲ ',
  warn: '',
}

export default function KpiCard({
  label,
  value,
  change,
  trend,
}: {
  label: string
  value: string
  change: string
  trend: Trend
}) {
  return (
    <div className="bg-white rounded-xl border border-ink-200 p-5">
      <p className="text-xs font-medium text-ink-500 mb-2">{label}</p>
      <p className="text-2xl font-bold text-ink-900">{value}</p>
      <p className={`text-xs font-medium mt-1 ${trendColor[trend]}`}>
        {trendPrefix[trend]}
        {change}
      </p>
    </div>
  )
}
