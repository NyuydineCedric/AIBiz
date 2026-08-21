import { useEffect, useState } from 'react'
import { Boxes, AlertTriangle } from 'lucide-react'
import * as api from '../lib/api'

export default function CurrentStock() {
  const [stock, setStock] = useState<api.StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .getStockLevels()
      .then(setStock)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load stock levels.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-ink-900 mb-1 flex items-center gap-2">
        <Boxes size={20} /> Current stock
      </h1>
      <p className="text-sm text-ink-500 mb-6">Purchased minus sold, across everything logged so far.</p>

      {error && (
        <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-4 py-3">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-ink-200">
        {loading ? (
          <p className="text-sm text-ink-500 px-5 py-4">Loading...</p>
        ) : stock.length === 0 ? (
          <p className="text-sm text-ink-500 px-5 py-4">No items logged yet.</p>
        ) : (
          <div className="max-h-[32rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="text-left text-xs text-ink-500 border-b border-ink-200">
                  <th className="px-5 py-3 font-medium">Item</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium text-right">Purchased</th>
                  <th className="px-5 py-3 font-medium text-right">Sold</th>
                  <th className="px-5 py-3 font-medium text-right">On hand</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((s) => (
                  <tr key={s.item_name} className={`border-b border-ink-100 last:border-b-0 ${s.low_stock ? 'bg-rose-50' : ''}`}>
                    <td className="px-5 py-3 text-ink-800 font-medium">{s.item_name}</td>
                    <td className="px-5 py-3 text-ink-600">{s.category || '—'}</td>
                    <td className="px-5 py-3 text-right text-ink-600">{s.quantity_purchased}</td>
                    <td className="px-5 py-3 text-right text-ink-600">{s.quantity_sold}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`font-semibold ${s.low_stock ? 'text-rose-700' : 'text-ink-800'}`}>
                        {s.quantity_on_hand}
                      </span>
                      {s.low_stock && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-rose-600">
                          <AlertTriangle size={11} /> Low stock
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
