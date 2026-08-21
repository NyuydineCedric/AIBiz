import { Fragment, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, ShoppingCart, PackagePlus, AlertTriangle, ChevronDown, ChevronUp, RefreshCw, Package } from 'lucide-react'
import * as api from '../lib/api'

const currency = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v)

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

type DraftLine = api.DailyEntryLine & { _key: string }

const emptyForm = { entry_type: 'sale' as api.EntryType, item_name: '', category: '', quantity: 1, unit_price: 0, notes: '' }

const emptyProductForm = { name: '', category: '', default_unit_price: 0 }

export default function DailyEntry() {
  const [entryDate, setEntryDate] = useState(todayISO())
  const [lines, setLines] = useState<DraftLine[]>([])
  const [form, setForm] = useState(emptyForm)

  const [days, setDays] = useState<api.DaySummary[]>([])
  const [stock, setStock] = useState<api.StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')

  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [dayEntries, setDayEntries] = useState<api.DailyEntry[]>([])
  const [loadingDay, setLoadingDay] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)

  // Product catalog — set up once by the owner, then picked from a dropdown
  // when logging a day instead of retyping the item name every time.
  const [products, setProducts] = useState<api.Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [productForm, setProductForm] = useState(emptyProductForm)
  const [savingProduct, setSavingProduct] = useState(false)
  const [usingCustomItem, setUsingCustomItem] = useState(false)

  const loadProducts = () => {
    setLoadingProducts(true)
    api
      .listProducts()
      .then(setProducts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load products.'))
      .finally(() => setLoadingProducts(false))
  }

  useEffect(loadProducts, [])

  const addProduct = async () => {
    if (!productForm.name.trim()) {
      setError('Give the product a name first.')
      return
    }
    setError('')
    setSavingProduct(true)
    try {
      await api.addProduct({
        name: productForm.name.trim(),
        category: productForm.category.trim(),
        default_unit_price: productForm.default_unit_price,
      })
      setProductForm(emptyProductForm)
      loadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add product.')
    } finally {
      setSavingProduct(false)
    }
  }

  const removeProduct = async (id: string) => {
    try {
      await api.deleteProduct(id)
      setProducts((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove product.')
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

  const rebuildData = async () => {
    setRebuilding(true)
    setError('')
    try {
      await api.rebuildDailyDataset()
      loadDaysAndStock()
      setSaveMessage('Data refreshed.')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh data.')
    } finally {
      setRebuilding(false)
    }
  }

  const loadDaysAndStock = () => {
    Promise.all([api.listDailyDays(30), api.getStockLevels()])
      .then(([d, s]) => {
        setDays(d)
        setStock(s)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load daily data.'))
      .finally(() => setLoading(false))
  }

  useEffect(loadDaysAndStock, [])

  const addLine = () => {
    if (!form.item_name.trim()) {
      setError('Give the item a name first.')
      return
    }
    if (form.quantity <= 0) {
      setError('Quantity must be greater than 0.')
      return
    }
    setError('')
    setLines((prev) => [...prev, { ...form, _key: `${Date.now()}-${Math.random()}` }])
    setForm({ ...emptyForm, entry_type: form.entry_type })
    setUsingCustomItem(false)
  }

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l._key !== key))

  const totals = useMemo(() => {
    let sales = 0
    let purchases = 0
    for (const l of lines) {
      const amt = l.quantity * l.unit_price
      if (l.entry_type === 'sale') sales += amt
      else purchases += amt
    }
    return { sales, purchases, net: sales - purchases }
  }, [lines])

  const saveDay = async () => {
    if (lines.length === 0) {
      setError('Add at least one line before saving the day.')
      return
    }
    setError('')
    setSaving(true)
    try {
      await api.addDailyEntries(
        entryDate,
        lines.map(({ _key, ...rest }) => rest)
      )
      const savedDate = entryDate
      setLines([])
      setSaveMessage(`Saved ${formatDate(savedDate)} — ${lines.length} line${lines.length === 1 ? '' : 's'}.`)
      setTimeout(() => setSaveMessage(''), 4000)
      loadDaysAndStock()
      if (expandedDay === savedDate) openDay(savedDate)

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
      loadDaysAndStock()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete entry.')
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Entry form */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-ink-200 p-5">
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
              step="0.01"
              placeholder="Qty"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
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
              No products set up yet — add some in the "Product catalog" panel so they show up as a dropdown here.
            </p>
          )}

          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-ink-500">
              Line total: <span className="font-semibold text-ink-800">{currency(form.quantity * form.unit_price)}</span>
            </p>
            <button
              onClick={addLine}
              className="flex items-center gap-1.5 bg-ink-900 hover:bg-ink-800 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
            >
              <Plus size={14} /> Add line
            </button>
          </div>

          {lines.length > 0 && (
            <div className="border border-ink-100 rounded-lg overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-500 bg-ink-50">
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 font-medium text-right">Qty</th>
                    <th className="px-3 py-2 font-medium text-right">Unit price</th>
                    <th className="px-3 py-2 font-medium text-right">Amount</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l._key} className="border-t border-ink-100">
                      <td className="px-3 py-2">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            l.entry_type === 'sale' ? 'text-teal-700 bg-teal-100' : 'text-amber-700 bg-amber-100'
                          }`}
                        >
                          {l.entry_type === 'sale' ? 'Sale' : 'Purchase'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-ink-800">{l.item_name}</td>
                      <td className="px-3 py-2 text-right text-ink-600">{l.quantity}</td>
                      <td className="px-3 py-2 text-right text-ink-600">{currency(l.unit_price)}</td>
                      <td className="px-3 py-2 text-right font-medium text-ink-800">{currency(l.quantity * l.unit_price)}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => removeLine(l._key)} className="text-ink-400 hover:text-rose-600">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              disabled={saving || lines.length === 0}
              className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              {saving ? 'Saving...' : `Save day (${lines.length})`}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {/* Product catalog */}
          <div className="bg-white rounded-xl border border-ink-200 p-5">
            <p className="text-sm font-semibold text-ink-900 mb-1 flex items-center gap-1.5">
              <Package size={15} /> Product catalog
            </p>
            <p className="text-xs text-ink-500 mb-3">
              Set up your products once — they'll appear in the dropdown above every time you log a sale or purchase.
            </p>

            <div className="flex flex-wrap gap-2 mb-3">
              <input
                placeholder="Product name"
                value={productForm.name}
                onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                className="flex-1 min-w-[110px] border border-ink-200 rounded-lg px-2.5 py-1.5 text-sm"
              />
              <input
                placeholder="Category"
                value={productForm.category}
                onChange={(e) => setProductForm((f) => ({ ...f, category: e.target.value }))}
                className="w-24 border border-ink-200 rounded-lg px-2.5 py-1.5 text-sm"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="Price"
                value={productForm.default_unit_price || ''}
                onChange={(e) => setProductForm((f) => ({ ...f, default_unit_price: Number(e.target.value) }))}
                className="w-20 border border-ink-200 rounded-lg px-2.5 py-1.5 text-sm"
              />
              <button
                onClick={addProduct}
                disabled={savingProduct}
                className="flex items-center gap-1 bg-ink-900 hover:bg-ink-800 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
              >
                <Plus size={13} /> Add
              </button>
            </div>

            {loadingProducts ? (
              <p className="text-sm text-ink-500">Loading...</p>
            ) : products.length === 0 ? (
              <p className="text-sm text-ink-500">No products yet — add your first one above.</p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {products.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg text-sm bg-ink-50">
                    <div>
                      <p className="text-ink-800 font-medium">{p.name}</p>
                      {(p.category || p.default_unit_price > 0) && (
                        <p className="text-xs text-ink-400">
                          {p.category}
                          {p.category && p.default_unit_price > 0 ? ' · ' : ''}
                          {p.default_unit_price > 0 ? currency(p.default_unit_price) : ''}
                        </p>
                      )}
                    </div>
                    <button onClick={() => removeProduct(p.id)} className="text-ink-400 hover:text-rose-600">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stock panel */}
          <div className="bg-white rounded-xl border border-ink-200 p-5">
          <p className="text-sm font-semibold text-ink-900 mb-1">Current stock</p>
          <p className="text-xs text-ink-500 mb-4">Purchased minus sold, across everything logged so far.</p>
          {loading ? (
            <p className="text-sm text-ink-500">Loading...</p>
          ) : stock.length === 0 ? (
            <p className="text-sm text-ink-500">No items logged yet.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {stock.map((s) => (
                <div
                  key={s.item_name}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                    s.low_stock ? 'bg-rose-50' : 'bg-ink-50'
                  }`}
                >
                  <div>
                    <p className="text-ink-800 font-medium">{s.item_name}</p>
                    {s.category && <p className="text-xs text-ink-400">{s.category}</p>}
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${s.low_stock ? 'text-rose-700' : 'text-ink-800'}`}>
                      {s.quantity_on_hand}
                    </p>
                    {s.low_stock && (
                      <p className="text-xs text-rose-600 flex items-center gap-1 justify-end">
                        <AlertTriangle size={11} /> Low stock
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Day log */}
      <div className="bg-white rounded-xl border border-ink-200 mt-6">
        <div className="px-5 py-4 border-b border-ink-200">
          <p className="text-sm font-semibold text-ink-900">Recent days</p>
        </div>
        {loading ? (
          <p className="text-sm text-ink-500 px-5 py-4">Loading...</p>
        ) : days.length === 0 ? (
          <p className="text-sm text-ink-500 px-5 py-4">No days logged yet — add your first entries above.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-500 border-b border-ink-200">
                <th className="px-5 py-3 font-medium">Day</th>
                <th className="px-5 py-3 font-medium text-right">Sales</th>
                <th className="px-5 py-3 font-medium text-right">Purchases</th>
                <th className="px-5 py-3 font-medium text-right">Net profit</th>
                <th className="px-5 py-3 font-medium text-right">Lines</th>
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
        )}
      </div>
    </div>
  )
}
