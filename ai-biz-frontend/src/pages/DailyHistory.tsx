import { Fragment, useEffect, useState } from 'react'
import { History, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import * as api from '../lib/api'

const currency = (v: number) =>
  new Intl.NumberFormat('fr-CM', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(v)

function formatDate(iso: string): string {
  // Parse as a plain date (no timezone shifting) so "2026-08-14" always reads as Aug 14.
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function DailyHistory() {
  const [days, setDays] = useState<api.DaySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [dayEntries, setDayEntries] = useState<api.DailyEntry[]>([])
  const [loadingDay, setLoadingDay] = useState(false)

  useEffect(() => {
    api
      .listDailyDays(30)
      .then(setDays)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load daily history.'))
      .finally(() => setLoading(false))
  }, [])

  const openDay = (date: string) => {
    if (expandedDay === date) {
      setExpandedDay(null)
      return
    }
    setExpandedDay(date)
    setLoadingDay(true)
    api
      .listDailyEntries(date)
      .then(setDayEntries)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load that day.'))
      .finally(() => setLoadingDay(false))
  }

  const deleteEntry = async (id: string) => {
    try {
      await api.deleteDailyEntry(id)
      setDayEntries((prev) => prev.filter((e) => e.id !== id))
      api.listDailyDays(30).then(setDays)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete entry.')
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-ink-900 mb-1 flex items-center gap-2">
        <History size={20} /> Recent days
      </h1>
      <p className="text-sm text-ink-500 mb-6">Everything logged on the Daily Log page, day by day.</p>

      {error && (
        <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-4 py-3">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-ink-200">
        {loading ? (
          <p className="text-sm text-ink-500 px-5 py-4">Loading...</p>
        ) : days.length === 0 ? (
          <p className="text-sm text-ink-500 px-5 py-4">No days logged yet — add your first entries on the Daily Log page.</p>
        ) : (
          <div className="max-h-[36rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="text-left text-xs text-ink-500 border-b border-ink-200">
                <th className="px-5 py-3 font-medium">Day</th>
                <th className="px-5 py-3 font-medium text-right">Sales</th>
                <th className="px-5 py-3 font-medium text-right">Purchases</th>
                <th className="px-5 py-3 font-medium text-right">Net profit</th>
                <th className="px-5 py-3 font-medium text-right">Items</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <Fragment key={d.entry_date}>
                  <tr
                    onClick={() => openDay(d.entry_date)}
                    className="border-b border-ink-100 cursor-pointer hover:bg-ink-50"
                  >
                    <td className="px-5 py-3 text-ink-800 font-medium">{formatDate(d.entry_date)}</td>
                    <td className="px-5 py-3 text-right text-teal-700">{currency(d.total_sales)}</td>
                    <td className="px-5 py-3 text-right text-amber-700">{currency(d.total_purchases)}</td>
                    <td className={`px-5 py-3 text-right font-medium ${d.net_profit >= 0 ? 'text-ink-800' : 'text-rose-600'}`}>
                      {currency(d.net_profit)}
                    </td>
                    <td className="px-5 py-3 text-right text-ink-500">{d.entry_count}</td>
                    <td className="px-5 py-3 text-right text-ink-400">
                      {expandedDay === d.entry_date ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </td>
                  </tr>
                  {expandedDay === d.entry_date && (
                    <tr>
                      <td colSpan={6} className="bg-ink-50 px-5 py-3">
                        {loadingDay ? (
                          <p className="text-xs text-ink-500">Loading...</p>
                        ) : (
                          <div className="space-y-1.5">
                            {dayEntries.map((e) => (
                              <div key={e.id} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2 border border-ink-100">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`font-semibold px-2 py-0.5 rounded-full ${
                                      e.entry_type === 'sale' ? 'text-teal-700 bg-teal-100' : 'text-amber-700 bg-amber-100'
                                    }`}
                                  >
                                    {e.entry_type === 'sale' ? 'Sale' : 'Purchase'}
                                  </span>
                                  <span className="text-ink-800">{e.item_name}</span>
                                  <span className="text-ink-400">
                                    {e.quantity} × {currency(e.unit_price)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-medium text-ink-800">{currency(e.amount)}</span>
                                  <button onClick={() => deleteEntry(e.id)} className="text-ink-400 hover:text-rose-600">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
