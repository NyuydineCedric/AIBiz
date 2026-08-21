import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { Insight } from '../lib/api'

const COLORS: Record<string, string> = {
  High: '#e11d48',
  Medium: '#d97706',
}

export default function RiskSeverityChart({ risks }: { risks: Insight[] }) {
  const counts = risks.reduce<Record<string, number>>((acc, r) => {
    acc[r.severity] = (acc[r.severity] ?? 0) + 1
    return acc
  }, {})

  const data = Object.entries(counts).map(([severity, count]) => ({ severity, count }))

  if (data.length === 0) {
    return (
      <div className="h-[220px] flex items-center justify-center text-sm text-ink-500 text-center px-6">
        No risks detected in this dataset — nothing to break down.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="severity"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={data.length > 1 ? 3 : 0}
          isAnimationActive={false}
          label={({ severity, count }) => `${severity}: ${count}`}
          labelLine={false}
        >
          {data.map((d) => (
            <Cell key={d.severity} fill={COLORS[d.severity] ?? '#94a3b8'} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number, name: string) => [`${value} risk${value === 1 ? '' : 's'}`, name]} />
        <Legend verticalAlign="bottom" height={24} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
