import { useEffect, useId, useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, Upload, Zap } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import * as api from '../lib/api'

// Distinct colour (solid + shimmer companion) per line, used both for a
// single metric's up/down/flat state and for telling two-or-more compared
// metrics apart on the same chart.
const TREND_COLORS: Record<'up' | 'down' | 'flat', { solid: string; shimmer: string }> = {
  up: { solid: '#059669', shimmer: '#34d399' },
  down: { solid: '#e11d48', shimmer: '#fb7185' },
  flat: { solid: '#4f46e5', shimmer: '#818cf8' },
}

// Extra palette for the 2nd, 3rd, 4th... metric on a comparison chart, so
// two rising products don't render as the same colour just because both
// trend "up".
const COMPARE_PALETTE = [
  { solid: '#4f46e5', shimmer: '#818cf8' }, // indigo
  { solid: '#0ea5e9', shimmer: '#7dd3fc' }, // sky
  { solid: '#d97706', shimmer: '#fbbf24' }, // amber
  { solid: '#db2777', shimmer: '#f9a8d4' }, // pink
]

const currency = (v: number) =>
  new Intl.NumberFormat('fr-CM', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(v)

const plainNumber = (v: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(v)

// Metrics like "Customer Retention Rate" or "Customer Count" aren't
// monetary amounts — format those as plain numbers instead of currency.
const isCurrencyMetric = (label: string) => !/rate|percent|count|ratio/i.test(label)

const axisLabel = (v: number, isCurrency: boolean) => {
  const suffix = isCurrency ? ' FCFA' : ''
  if (Math.abs(v) >= 1000) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v) + suffix
  }
  return v.toFixed(0) + suffix
}

const PERIOD_OPTIONS = [7, 14, 30]

// Daily-log labels look like "Aug Wk1 Mon" — split into a group heading
// ("Aug Wk1") and the day itself ("Mon") so the axis can show the heading
// only once, above the first day of each week, with plain weekday names
// underneath it rather than repeating the full label on every tick.
// File-upload labels ("Day 5") don't match this shape and render as-is.
const WEEK_LABEL_RE = /^(.+Wk\d+)\s+(\S+)$/
function splitDayLabel(label: string): { heading: string; day: string } | null {
  const match = WEEK_LABEL_RE.exec(label)
  if (!match) return null
  return { heading: match[1], day: match[2] }
}

type ChartPoint = { period: string; [dataKey: string]: number | string | null }

export default function Forecast() {
  const gradId = useId().replace(/[:]/g, '')
  const [periodsAhead, setPeriodsAhead] = useState(7)
  const [data, setData] = useState<api.ForecastDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    api
      .getForecast(periodsAhead)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load forecast.'))
      .finally(() => setLoading(false))
  }, [periodsAhead])

  // series is always populated by the backend when has_data + points exist;
  // fall back to the flat single-metric fields just in case (older cached
  // response shape, or an empty series list on a "not enough data" reply).
  const seriesList: api.MetricSeries[] = useMemo(() => {
    if (!data) return []
    if (data.series && data.series.length > 0) return data.series
    if (data.actual.labels.length > 0) {
      return [
        {
          metric_label: data.metric_label,
          actual: data.actual,
          forecast_labels: data.forecast_labels,
          forecast_values: data.forecast_values,
          lower_bound: data.lower_bound,
          upper_bound: data.upper_bound,
          trend: data.trend,
          slope_per_period: data.slope_per_period,
        },
      ]
    }
    return []
  }, [data])

  const isComparison = seriesList.length > 1

  const colorFor = (index: number, trend: 'up' | 'down' | 'flat') =>
    isComparison ? COMPARE_PALETTE[index % COMPARE_PALETTE.length] : TREND_COLORS[trend] || TREND_COLORS.flat

  // Union of every period label across all series (actual + forecast),
  // in first-seen order — for daily-log data every metric shares the same
  // calendar days already, so this is just that shared list; for a lone
  // file-upload series it's simply that series' own labels.
  const periodLabels = useMemo(() => {
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const s of seriesList) {
      for (const l of [...s.actual.labels, ...s.forecast_labels]) {
        if (!seen.has(l)) {
          seen.add(l)
          ordered.push(l)
        }
      }
    }
    return ordered
  }, [seriesList])

  const points: ChartPoint[] = useMemo(() => {
    if (periodLabels.length === 0) return []
    return periodLabels.map((period) => {
      const point: ChartPoint = { period }
      seriesList.forEach((s, i) => {
        const ai = s.actual.labels.indexOf(period)
        point[`actual_${i}`] = ai >= 0 ? s.actual.values[ai] ?? null : null
        const fi = s.forecast_labels.indexOf(period)
        point[`forecast_${i}`] = fi >= 0 ? s.forecast_values[fi] ?? null : null
      })
      return point
    })
  }, [periodLabels, seriesList])

  // Bridge each series' actual line into its forecast line at the boundary
  // point (same value on both keys there) so the dashed segment visually
  // connects instead of leaving a gap.
  seriesList.forEach((s, i) => {
    if (s.forecast_labels.length === 0 || s.actual.labels.length === 0) return
    const lastActualLabel = s.actual.labels[s.actual.labels.length - 1]
    const point = points.find((p) => p.period === lastActualLabel)
    if (point) point[`forecast_${i}`] = s.actual.values[s.actual.values.length - 1] ?? null
  })

  // Daily-log labels look like "Aug Wk1 Mon" — the axis itself just shows
  // the weekday ("Mon"); the month/week context goes beside the chart's
  // heading instead (see periodRangeLabel below), not repeated per tick.
  const formatPeriodTick = (label: string) => splitDayLabel(label)?.day ?? label

  // "Aug Wk1 – Aug Wk3"-style range covering everything plotted (actual +
  // forecast), shown next to the chart heading. Only set for daily-log
  // data — file-upload labels ("Day N") don't parse, so this stays empty.
  const periodRangeLabel = useMemo(() => {
    if (periodLabels.length === 0) return ''
    const first = splitDayLabel(periodLabels[0])
    const last = splitDayLabel(periodLabels[periodLabels.length - 1])
    if (!first || !last) return ''
    return first.heading === last.heading ? first.heading : `${first.heading} – ${last.heading}`
  }, [periodLabels])

  const lastActualPeriod = seriesList[0]?.actual.labels[seriesList[0].actual.labels.length - 1]

  if (loading) {
    return <div className="p-6 text-sm text-ink-500">Loading forecast...</div>
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-4 py-3">{error}</div>
      </div>
    )
  }

  if (!data || !data.has_data) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl border border-dashed border-ink-300 p-12 text-center">
          <Upload size={36} className="text-brand-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-ink-800 mb-1">No data yet</p>
          <p className="text-sm text-ink-500">Log a day of sales/purchases, or upload a business report, to generate a forecast.</p>
        </div>
      </div>
    )
  }

  const hasAnyPoints = points.length > 0
  const noForecastYet = hasAnyPoints && seriesList.every((s) => s.forecast_labels.length === 0)

  const metricsHeading = seriesList.map((s) => s.metric_label).join(' vs ') || 'Revenue'

  const header = (
    <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
      <h1 className="text-lg font-semibold text-ink-900">Forecast</h1>
      <div className="flex items-center gap-1 bg-ink-100 rounded-lg p-1">
        {PERIOD_OPTIONS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriodsAhead(p)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-md transition ${
              periodsAhead === p ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {p} days
          </button>
        ))}
      </div>
    </div>
  )

  if (!hasAnyPoints) {
    return (
      <div className="p-6">
        {header}
        <p className="text-sm text-ink-500 mb-6">
          A projection of where revenue is headed, based on the trend in your uploaded data.
        </p>
        <div className="bg-white rounded-xl border border-dashed border-ink-300 p-12 text-center">
          <Upload size={36} className="text-brand-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-ink-800 mb-1">No revenue trend detected</p>
          <p className="text-sm text-ink-500">
            Log a day of sales, or upload a file with a numeric revenue/sales column, to see a trend here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {header}
      <p className="text-sm text-ink-500 mb-6">
        {isComparison
          ? `A projection of where ${metricsHeading.toLowerCase()} are headed, based on your latest chat question.`
          : `A projection of where ${metricsHeading.toLowerCase()} is headed, based on the trend in your uploaded data and your latest chat question.`}
      </p>

      {data.ai_insight && (
        <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 mb-6 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center shrink-0">
            <Zap size={16} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold text-brand-700 mb-1">AI forecast insight</p>
            <p className="text-sm text-ink-700 leading-relaxed">{data.ai_insight}</p>
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 ${seriesList.length <= 1 ? 'lg:grid-cols-3' : ''}`}>
        {seriesList.map((s, i) => {
          const color = colorFor(i, (s.trend as 'up' | 'down' | 'flat') || 'flat').solid
          const isCurrency = isCurrencyMetric(s.metric_label)
          const formatValue = isCurrency ? currency : plainNumber
          const currentValue = s.actual.values[s.actual.values.length - 1] ?? 0
          const projectedValue = s.forecast_values[s.forecast_values.length - 1] ?? 0
          const pctChange = currentValue !== 0 ? ((projectedValue - currentValue) / Math.abs(currentValue)) * 100 : 0
          const sign = pctChange >= 0 ? '+' : ''
          const TrendIcon = s.trend === 'up' ? TrendingUp : s.trend === 'down' ? TrendingDown : Minus
          return (
            <div key={s.metric_label} className="bg-white rounded-xl border border-ink-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-ink-500 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  {s.metric_label}
                </p>
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${color}1a` }}
                >
                  <TrendIcon size={14} color={color} />
                </div>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] text-ink-400">Current</p>
                  <p className="text-lg font-bold text-ink-900">{formatValue(currentValue)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-ink-400">{periodsAhead}d out</p>
                  <p className="text-lg font-bold text-ink-900">
                    {s.forecast_labels.length > 0 ? formatValue(projectedValue) : '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-ink-400">Change</p>
                  <p className="text-sm font-bold" style={{ color }}>
                    {sign}
                    {pctChange.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-xl border border-ink-200 p-6">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <p className="text-sm font-semibold text-ink-900">Chart for {metricsHeading}</p>
          {periodRangeLabel && (
            <span className="text-xs font-semibold text-ink-500 bg-ink-100 px-2 py-0.5 rounded-full">
              {periodRangeLabel}
            </span>
          )}
        </div>

        {noForecastYet && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
            {data.note || `Not enough historical days yet to project a forecast — showing actual ${metricsHeading.toLowerCase()} only.`}
          </p>
        )}

        <style>{`
          @keyframes forecast-dash-flow {
            to { stroke-dashoffset: -22; }
          }
          .forecast-projected-line .recharts-line-curve {
            animation: forecast-dash-flow 0.9s linear infinite;
          }
        `}</style>

        <ResponsiveContainer width="100%" height={440}>
            <LineChart data={points} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                {/* Traveling highlight band that sweeps left-to-right along
                    whatever path it's applied to (objectBoundingBox makes it
                    relative to each path's own box) — reads as a wave passing
                    over the line. One gradient per series so each keeps its
                    own colour. */}
                {seriesList.map((s, i) => {
                  const shimmer = colorFor(i, (s.trend as 'up' | 'down' | 'flat') || 'flat').shimmer
                  return (
                    <linearGradient
                      key={i}
                      id={`forecastLineGrad-${gradId}-${i}`}
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="0%"
                      gradientUnits="objectBoundingBox"
                    >
                      <stop offset="0%" stopColor={shimmer} stopOpacity="0" />
                      <stop offset="38%" stopColor={shimmer} stopOpacity="0" />
                      <stop offset="48%" stopColor={shimmer} stopOpacity="0.55" />
                      <stop offset="50%" stopColor="#ffffff" stopOpacity="0.85" />
                      <stop offset="52%" stopColor={shimmer} stopOpacity="0.55" />
                      <stop offset="62%" stopColor={shimmer} stopOpacity="0" />
                      <stop offset="100%" stopColor={shimmer} stopOpacity="0" />
                      <animateTransform
                        attributeName="gradientTransform"
                        type="translate"
                        from="-1.4 0"
                        to="1.4 0"
                        dur="2.4s"
                        repeatCount="indefinite"
                      />
                    </linearGradient>
                  )
                })}
              </defs>
              <CartesianGrid stroke="#eef0f2" vertical={false} />
              <XAxis
                dataKey="period"
                tickFormatter={formatPeriodTick}
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => axisLabel(v, isCurrencyMetric(seriesList[0]?.metric_label || 'Revenue'))}
                width={56}
                domain={['auto', 'auto']}
              />
              <Tooltip
                formatter={(value: any, name: string) => {
                  const match = /^(actual|forecast)_(\d+)$/.exec(name)
                  if (!match) return [value, name]
                  const idx = Number(match[2])
                  const s = seriesList[idx]
                  const label = s?.metric_label || name
                  const formatValue = isCurrencyMetric(label) ? currency : plainNumber
                  const kind = match[1] === 'forecast' ? 'Projected' : 'Actual'
                  return [formatValue(value as number), `${label} (${kind})`]
                }}
                labelFormatter={(label: string) => label}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
              />
              {isComparison && (
                <Legend
                  verticalAlign="top"
                  height={28}
                  formatter={(value: string) => {
                    const match = /^(actual|forecast)_(\d+)$/.exec(value)
                    if (!match) return value
                    return seriesList[Number(match[2])]?.metric_label || value
                  }}
                />
              )}
              {lastActualPeriod && (
                <ReferenceLine
                  x={lastActualPeriod}
                  stroke="#e2e8f0"
                  label={{ value: 'Today →', position: 'top', fontSize: 11, fill: '#94a3b8' }}
                />
              )}

              {seriesList.map((s, i) => {
                const color = colorFor(i, (s.trend as 'up' | 'down' | 'flat') || 'flat').solid
                return (
                  <Line
                    key={`actual_${i}`}
                    type="monotone"
                    dataKey={`actual_${i}`}
                    name={`actual_${i}`}
                    stroke={color}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                    isAnimationActive={false}
                    legendType={isComparison ? 'line' : 'none'}
                  />
                )
              })}
              {seriesList.map((s, i) => (
                <Line
                  key={`forecast_${i}`}
                  type="monotone"
                  dataKey={`forecast_${i}`}
                  name={`forecast_${i}`}
                  stroke={colorFor(i, (s.trend as 'up' | 'down' | 'flat') || 'flat').solid}
                  strokeWidth={2.5}
                  strokeDasharray="6 5"
                  dot={false}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  isAnimationActive={false}
                  className="forecast-projected-line"
                  legendType="none"
                />
              ))}

              {/* Wave overlay: same data keys redrawn on top with each
                  series' traveling highlight gradient as stroke, dots and
                  tooltip disabled so they're purely decorative. */}
              {seriesList.map((s, i) => (
                <Line
                  key={`actual-wave_${i}`}
                  type="monotone"
                  dataKey={`actual_${i}`}
                  stroke={`url(#forecastLineGrad-${gradId}-${i})`}
                  strokeWidth={4}
                  dot={false}
                  activeDot={false}
                  legendType="none"
                  tooltipType="none"
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
              {seriesList.map((s, i) => (
                <Line
                  key={`forecast-wave_${i}`}
                  type="monotone"
                  dataKey={`forecast_${i}`}
                  stroke={`url(#forecastLineGrad-${gradId}-${i})`}
                  strokeWidth={4}
                  strokeDasharray="6 5"
                  dot={false}
                  activeDot={false}
                  legendType="none"
                  tooltipType="none"
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
        </ResponsiveContainer>

        <p className="text-xs text-ink-400 mt-2">
          {isComparison
            ? 'Solid lines are actual values, dashed lines are the projected trend — one colour per metric, matching the legend above.'
            : `Solid line is actual ${metricsHeading.toLowerCase()}, dashed line is the projected trend — the same numbers the AI insight above is describing.`}
        </p>
      </div>
    </div>
  )
}
