import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, ShoppingCart, PackagePlus, RefreshCw } from 'lucide-react'
import * as api from '../lib/api'

const currency = (v: number) =>
  new Intl.NumberFormat('fr-CM', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(v)

function todayISO(): string {
  const d = new Date()
  const offset = d.getTimezoneOffset()
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10)
}

function formatDate(iso: string): string {
  // Parse as a plain date (no timezone shifting) so "2026-08-14" always reads as Aug 14.
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

type DraftItem = api.DailyEntryItem & { _key: string }

const emptyForm = { entry_type: 'sale' as api.EntryType, item_name: '', category: '', quantity: 1, unit_price: 0, notes: '' }

export default function DailyEntry() {
  const [entryDate, setEntryDate] = useState(todayISO())
  const [items, setItems] = useState<DraftItem[]>([])
  const [form, setForm] = useState(emptyForm)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [rebuilding, setRebuilding] = useState(false)

  // Product catalog — managed on its own page (Product catalog), just read
  // here to populate the item dropdown when logging a day.
  const [products, setProducts] = useState<api.Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [usingCustomItem, setUsingCustomItem] = useState(false)

  // Current stock — read here too, purely so a sale can be checked against
  // what's actually on hand before it's added ("the store cannot sell what
  // it does not have"). Managed for real on the Current Stock page.
  const [stock, setStock] = useState<api.StockItem[]>([])

  useEffect(() => {
    api
      .listProducts()
      .then(setProducts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load products.'))
      .finally(() => setLoadingProducts(false))
  }, [])

  const loadStock = () => {
    api.getStockLevels().then(setStock).catch(() => {
      // Non-critical — worst case the stock check just falls back to
      // treating unknown items as "0 on hand" (see stockOnHand below).
    })
  }

  useEffect(loadStock, [])

  const stockOnHand = (name: string) => stock.find((s) => s.item_name === name)?.quantity_on_hand ?? 0

  // How much of an item is actually available right now, accounting for
  // sale/purchase items already queued (but not yet saved) for it today —
  // otherwise queuing two sales of the same item in one sitting wouldn't
  // catch the second one going negative until after "Save day".
  const availableToSell = (name: string) =>
    items.reduce(
      (avail, it) => (it.item_name === name ? avail + (it.entry_type === 'sale' ? -it.quantity : it.quantity) : avail),
      stockOnHand(name)
    )

  // The date always starts as "today" in local component state, but since
  // Recent Days/Product catalog/Current stock are now their own pages, just
  // navigating over to one of them and back remounts this page and would
  // silently reset that back to today, undoing the day it had already
  // advanced to. Deriving it from the actual last saved day instead — one
  // day after whatever was most recently logged — makes it survive
  // navigation (and even a page reload) instead of only living in memory.
  useEffect(() => {
    api
      .listDailyDays(1)
      .then((days) => {
        if (days.length > 0) {
          setEntryDate(addDaysISO(days[0].entry_date, 1))
        }
      })
      .catch(() => {
        // Non-critical — just keep today's date as the fallback.
      })
  }, [])

  const rebuildData = async () => {
    setRebuilding(true)
    setError('')
    try {
      await api.rebuildDailyDataset()
      setSaveMessage('Data refreshed.')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh data.')
    } finally {
      setRebuilding(false)
    }
  }

  // Picking a product from the dropdown fills in its category and default
  // price too, so the owner usually only has to adjust quantity.
  const selectProduct = (name: string) => {
    if (name === '__custom__') {
      setUsingCustomItem(true)
      setForm((f) => ({ ...f, item_name: '', category: '' }))
      return
    }
    const product = products.find((p) => p.name === name)
    setForm((f) => ({
      ...f,
      item_name: name,
      category: product?.category || '',
      unit_price: product?.default_unit_price || f.unit_price,
    }))
  }

  const addItem = () => {
    if (!form.item_name.trim()) {
      setError('Give the item a name first.')
      return
    }
    if (form.quantity <= 0) {
      setError('Quantity must be greater than 0.')
      return
    }
    if (form.entry_type === 'sale') {
      const available = availableToSell(form.item_name)
      if (form.quantity > available) {
        setError(
          available <= 0
            ? `${form.item_name} is out of stock.`
            : `Only ${available} of ${form.item_name} in stock — can't sell ${form.quantity}.`
        )
        return
      }
    }
    setError('')
    setItems((prev) => [...prev, { ...form, _key: `${Date.now()}-${Math.random()}` }])
    setForm({ ...emptyForm, entry_type: form.entry_type })
    setUsingCustomItem(false)
  }

  const removeItem = (key: string) => setItems((prev) => prev.filter((it) => it._key !== key))

  const totals = useMemo(() => {
    let sales = 0
    let purchases = 0
    for (const it of items) {
      const amt = it.quantity * it.unit_price
      if (it.entry_type === 'sale') sales += amt
      else purchases += amt
    }
    return { sales, purchases, net: sales - purchases }
  }, [items])

  const saveDay = async () => {
    if (items.length === 0) {
      setError('Add at least one item before saving the day.')
      return
    }
    setError('')
    setSaving(true)
    try {
      await api.addDailyEntries(
        entryDate,
        items.map(({ _key, ...rest }) => rest)
      )
      const savedDate = entryDate
      setItems([])
      setSaveMessage(`Saved ${formatDate(savedDate)} — ${items.length} item${items.length === 1 ? '' : 's'}.`)
      setTimeout(() => setSaveMessage(''), 4000)
      loadStock()

      // Once a day is saved, that day is "closed" — always move the picker
      // to the next calendar day, even past today, so the form is already
      // sitting on the right day next time the owner opens it.
      setEntryDate(addDaysISO(savedDate, 1))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save entries.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-1 flex-wrap">
        <h1 className="text-lg font-semibold text-ink-900">Daily Log</h1>
        <button
          onClick={rebuildData}
          disabled={rebuilding}
          className="flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-800 disabled:opacity-50 transition"
          title="Recompute KPIs, trend, and forecast from your logged entries"
        >
          <RefreshCw size={13} className={rebuilding ? 'animate-spin' : ''} />
          {rebuilding ? 'Refreshing...' : 'Refresh data'}
        </button>
      </div>
      <p className="text-sm text-ink-500 mb-6">
        Record what was bought and sold each day — KPIs, forecasts, and the AI chat all update from this automatically.
      </p>

      {error && (
        <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-4 py-3">{error}</div>
      )}
      {saveMessage && (
        <div className="mb-4 text-sm text-teal-700 bg-teal-50 border border-teal-100 rounded-lg px-4 py-3">{saveMessage}</div>
      )}

      {/* Entry form */}
      <div className="bg-white rounded-xl border border-ink-200 p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <p className="text-sm font-semibold text-ink-900">Log entries for</p>
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="border border-ink-200 rounded-lg px-3 py-1.5 text-sm text-ink-800"
          />
        </div>

        <div className="flex items-center gap-1 bg-ink-100 rounded-lg p-1 mb-4 w-fit">
          <button
            onClick={() => setForm((f) => ({ ...f, entry_type: 'sale' }))}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition ${
              form.entry_type === 'sale' ? 'bg-white text-teal-700 shadow-sm' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            <ShoppingCart size={14} /> Sale
          </button>
          <button
            onClick={() => setForm((f) => ({ ...f, entry_type: 'purchase' }))}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition ${
              form.entry_type === 'purchase' ? 'bg-white text-amber-700 shadow-sm' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            <PackagePlus size={14} /> Purchase (stock in)
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
          {products.length > 0 && !usingCustomItem ? (
            <select
              value={form.item_name}
              onChange={(e) => selectProduct(e.target.value)}
              className="col-span-2 border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Select a product</option>
              {products.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
              <option value="__custom__">+ Type a one-off item…</option>
            </select>
          ) : (
            <div className="col-span-2 flex items-center gap-1.5">
              <input
                placeholder="Item name"
                value={form.item_name}
                onChange={(e) => setForm((f) => ({ ...f, item_name: e.target.value }))}
                className="flex-1 border border-ink-200 rounded-lg px-3 py-2 text-sm"
              />
              {products.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setUsingCustomItem(false)
                    setForm((f) => ({ ...f, item_name: '' }))
                  }}
                  className="text-xs text-ink-400 hover:text-ink-700 shrink-0"
                  title="Back to product list"
                >
                  List
                </button>
              )}
            </div>
          )}
          <input
            placeholder="Category (optional)"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="border border-ink-200 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={0}
            step="1"
            placeholder="Qty"
            value={form.quantity}
            onChange={(e) => setForm((f) => ({ ...f, quantity: Math.round(Number(e.target.value)) }))}
            className="border border-ink-200 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="Unit price"
            value={form.unit_price}
            onChange={(e) => setForm((f) => ({ ...f, unit_price: Number(e.target.value) }))}
            className="border border-ink-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {products.length === 0 && !loadingProducts && (
          <p className="text-xs text-ink-400 mb-3">
            No products set up yet — add some on the Product catalog page so they show up as a dropdown here.
          </p>
        )}

        {form.entry_type === 'sale' && form.item_name && (
          <p className={`text-xs mb-3 ${availableToSell(form.item_name) <= 0 ? 'text-rose-600' : 'text-ink-400'}`}>
            {availableToSell(form.item_name) <= 0
              ? `${form.item_name} is out of stock.`
              : `${availableToSell(form.item_name)} ${form.item_name} in stock.`}
          </p>
        )}

        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-ink-500">
            Item total: <span className="font-semibold text-ink-800">{currency(form.quantity * form.unit_price)}</span>
          </p>
          <button
            onClick={addItem}
            className="flex items-center gap-1.5 bg-ink-900 hover:bg-ink-800 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
          >
            <Plus size={14} /> Add item
          </button>
        </div>

        {items.length > 0 && (
          <div className="border border-ink-100 rounded-lg overflow-hidden mb-4">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-ink-50 z-10">
                  <tr className="text-left text-xs text-ink-500">
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 font-medium text-right">Qty</th>
                    <th className="px-3 py-2 font-medium text-right">Unit price</th>
                    <th className="px-3 py-2 font-medium text-right">Amount</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it._key} className="border-t border-ink-100 bg-white">
                      <td className="px-3 py-2">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            it.entry_type === 'sale' ? 'text-teal-700 bg-teal-100' : 'text-amber-700 bg-amber-100'
                          }`}
                        >
                          {it.entry_type === 'sale' ? 'Sale' : 'Purchase'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-ink-800">{it.item_name}</td>
                      <td className="px-3 py-2 text-right text-ink-600">{it.quantity}</td>
                      <td className="px-3 py-2 text-right text-ink-600">{currency(it.unit_price)}</td>
                      <td className="px-3 py-2 text-right font-medium text-ink-800">{currency(it.quantity * it.unit_price)}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => removeItem(it._key)} className="text-ink-400 hover:text-rose-600">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-ink-100 pt-4">
          <div className="text-xs text-ink-500 space-x-4">
            <span>
              Sales: <span className="font-semibold text-teal-700">{currency(totals.sales)}</span>
            </span>
            <span>
              Purchases: <span className="font-semibold text-amber-700">{currency(totals.purchases)}</span>
            </span>
            <span>
              Net: <span className="font-semibold text-ink-800">{currency(totals.net)}</span>
            </span>
          </div>
          <button
            onClick={saveDay}
            disabled={saving || items.length === 0}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            {saving ? 'Saving...' : `Save day (${items.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
