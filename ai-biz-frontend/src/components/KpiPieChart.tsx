import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import type { Kpi } from '../lib/api'

const COLORS = ['#4f46e5', '#059669', '#d97706', '#e11d48', '#0891b2', '#7c3aed']

const trendColor: Record<Kpi['trend'], string> = {
  up: 'text-teal-600',
  down: 'text-rose-600',
  warn: 'text-amber-600',
}

function parseValue(raw: string): number {
  const n = parseFloat(raw.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? Math.abs(n) : 0
}

export default function KpiPieChart({ kpis }: { kpis: Kpi[] }) {
  const all = kpis.map((k, i) => ({
    name: k.label,
    value: parseValue(k.value),
    displayValue: k.value,
    change: k.change,
    trend: k.trend,
    color: COLORS[i % COLORS.length],
  }))

  const total = all.reduce((sum, d) => sum + d.value, 0)
  // Slices under ~1% just clutter the ring with an invisible sliver — keep them
  // out of the chart geometry but still show a card for every metric below.
  const chartData = total > 0 ? all.filter((d) => d.value / total >= 0.01) : []

  if (kpis.length === 0) {
    return <div className="h-[280px] flex items-center justify-center text-sm text-ink-500">No KPI data available.</div>
  }

  return (
    <div>
      <style>{`
        @keyframes kpiPieSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {chartData.length > 0 && (
        <div
          className="mx-auto"
          style={{ animation: 'kpiPieSpin 16s linear infinite', width: 300, height: 300 }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={90}
                outerRadius={140}
                paddingAngle={3}
                stroke="#ffffff"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {chartData.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
        {all.map((d) => (
          <div key={d.name} className="bg-ink-50 border border-ink-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-xs font-medium text-ink-600 truncate">{d.name}</span>
            </div>
            <p className="text-lg font-bold text-ink-900">{d.displayValue}</p>
            <p className={`text-xs font-medium mt-0.5 ${trendColor[d.trend]}`}>{d.change}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
