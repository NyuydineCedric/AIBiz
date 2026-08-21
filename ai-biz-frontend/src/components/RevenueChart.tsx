import { useId, useMemo } from 'react'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { Series } from '../lib/api'

const currency = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

const compact = (v: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v)

type Direction = 'up' | 'down' | 'flat'
type Point = { period: string; actual: number | null; forecast: number | null }

export default function RevenueChart({ series, forecast }: { series: Series; forecast?: Series }) {
  const uid = useId().replace(/[:]/g, '')
  const lineGradId = `revLine-${uid}`
  const fillGradId = `revFill-${uid}`

  const stats = useMemo(() => {
    const values = series.values || []
    const first = values[0] ?? 0
    const last = values[values.length - 1] ?? 0
    const pct = values.length < 2 || first === 0 ? 0 : ((last - first) / Math.abs(first)) * 100
    const direction: Direction = pct > 1 ? 'up' : pct < -1 ? 'down' : 'flat'
    return { direction, pct, first, last }
  }, [series])

  const forecastColor =
    stats.direction === 'up' ? '#059669' : stats.direction === 'down' ? '#e11d48' : '#4f46e5'

  const hasForecast = !!forecast && forecast.labels.length > 0 && forecast.values.length > 0

  const data: Point[] = useMemo(() => {
    const points: Point[] = series.labels.map((label, i) => ({
      period: label,
      actual: series.values[i] ?? null,
      forecast: null,
    }))
    if (hasForecast && points.length > 0) {
      // Bridge point so the dashed forecast line starts exactly where the solid actual line ends.
      points[points.length - 1] = { ...points[points.length - 1], forecast: points[points.length - 1].actual }
      forecast!.labels.forEach((label, i) => {
        points.push({ period: label, actual: null, forecast: forecast!.values[i] ?? null })
      })
    }
    return points
  }, [series, forecast, hasForecast])

  const lastActualPeriod = series.labels[series.labels.length - 1]

  const sign = stats.pct >= 0 ? '+' : ''
  const directionColor =
    stats.direction === 'up'
      ? 'text-teal-700 bg-teal-50'
      : stats.direction === 'down'
      ? 'text-rose-700 bg-rose-50'
      : 'text-ink-600 bg-ink-100'
  const directionLabel =
    stats.direction === 'up' ? 'Trending up' : stats.direction === 'down' ? 'Trending down' : 'Roughly flat'

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-sm text-ink-600">
          Revenue moved from <span className="font-semibold text-ink-900">{currency(stats.first)}</span> to{' '}
          <span className="font-semibold text-ink-900">{currency(stats.last)}</span> across the periods shown.
        </p>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${directionColor}`}>
          {directionLabel} ({sign}
          {stats.pct.toFixed(1)}%)
        </span>
      </div>

      <ResponsiveContainer width="100%" height={420}>
        <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={lineGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981">
                <animate attributeName="stop-color" values="#10b981;#06b6d4;#6366f1;#10b981" dur="8s" repeatCount="indefinite" />
              </stop>
              <stop offset="55%" stopColor="#6366f1">
                <animate attributeName="stop-color" values="#6366f1;#8b5cf6;#06b6d4;#6366f1" dur="8s" repeatCount="indefinite" />
              </stop>
              <stop offset="100%" stopColor="#4f46e5">
                <animate attributeName="stop-color" values="#4f46e5;#4338ca;#4f46e5" dur="8s" repeatCount="indefinite" />
              </stop>
            </linearGradient>
            <linearGradient id={fillGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.35}>
                <animate attributeName="stop-color" values="#10b981;#06b6d4;#6366f1;#10b981" dur="8s" repeatCount="indefinite" />
              </stop>
              <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" vertical={false} />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 12, fill: '#64748b' }}
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
            label={{ value: 'Period (oldest → most recent)', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#94a3b8' }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => '$' + compact(v)}
            width={56}
            label={{ value: 'Revenue', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#94a3b8' }}
          />
          <Tooltip
            formatter={(value: number, name: string) => [currency(value), name === 'forecast' ? 'Forecast' : 'Revenue']}
            labelFormatter={(label: string) => `Period ${label}`}
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
          />
          {hasForecast && (
            <ReferenceLine
              x={lastActualPeriod}
              stroke="#cbd5e1"
              strokeDasharray="4 4"
              label={{ value: 'Forecast →', position: 'top', fontSize: 11, fill: '#94a3b8' }}
            />
          )}

          <Area
            type="monotone"
            dataKey="actual"
            stroke={`url(#${lineGradId})`}
            strokeWidth={3}
            fill={`url(#${fillGradId})`}
            connectNulls={false}
            dot={{ r: 3.5, fill: '#6366f1', strokeWidth: 0 }}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          />
          {hasForecast && (
            <Line
              type="monotone"
              dataKey="forecast"
              stroke={forecastColor}
              strokeWidth={2.5}
              strokeDasharray="6 5"
              dot={{ r: 3, fill: '#ffffff', stroke: forecastColor, strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-xs text-ink-400 mt-2">
        Each period is an equal-sized slice of your uploaded data, in the order the rows appeared (oldest on the
        left).{' '}
        {hasForecast
          ? 'The dashed line is a linear projection of the next few periods, not real data.'
          : 'Hover a point for its exact value.'}
      </p>
    </div>
  )
}
