import { useEffect, useState } from 'react'
import { Plus, Trash2, Package, Pencil, Check, X } from 'lucide-react'
import * as api from '../lib/api'

const currency = (v: number) =>
  new Intl.NumberFormat('fr-CM', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(v)

const emptyProductForm = { name: '', category: '', default_unit_price: 0 }

export default function ProductCatalog() {
  const [products, setProducts] = useState<api.Product[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyProductForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Inline price editing — prices drift up and down over time, so this
  // lets the owner update just the price (or category) without deleting
  // and re-adding the product, which would lose its sales history.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const load = () => {
    setLoading(true)
    api
      .listProducts()
      .then(setProducts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load products.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const addProduct = async () => {
    if (!form.name.trim()) {
      setError('Give the product a name first.')
      return
    }
    setError('')
    setSaving(true)
    try {
      await api.addProduct({
        name: form.name.trim(),
        category: form.category.trim(),
        default_unit_price: form.default_unit_price,
      })
      setForm(emptyProductForm)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add product.')
    } finally {
      setSaving(false)
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

  const startEdit = (p: api.Product) => {
    setEditingId(p.id)
    setEditPrice(p.default_unit_price ? String(p.default_unit_price) : '')
    setEditCategory(p.category)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditPrice('')
    setEditCategory('')
  }

  const saveEdit = async (id: string) => {
    const price = Number(editPrice)
    if (editPrice !== '' && (isNaN(price) || price < 0)) {
      setError('Price must be a valid, non-negative number.')
      return
    }
    setError('')
    setSavingEdit(true)
    try {
      const updated = await api.updateProduct(id, {
        category: editCategory.trim(),
        default_unit_price: editPrice === '' ? 0 : price,
      })
      setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)))
      cancelEdit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update product.')
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-ink-900 mb-1 flex items-center gap-2">
        <Package size={20} /> Product catalog
      </h1>
      <p className="text-sm text-ink-500 mb-6">
        Set up your products once — they'll appear in the item dropdown on the Daily Log page every time you log a
        sale or purchase. Prices drift, so edit them here whenever they change.
      </p>

      {error && (
        <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-4 py-3">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-ink-200 p-5 mb-6">
        <p className="text-sm font-semibold text-ink-900 mb-3">Add a product</p>
        <div className="flex flex-wrap gap-2">
          <input
            placeholder="Product name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="flex-1 min-w-[160px] border border-ink-200 rounded-lg px-3 py-2 text-sm"
          />
          <input
            placeholder="Category (optional)"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="w-40 border border-ink-200 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="Default price"
            value={form.default_unit_price || ''}
            onChange={(e) => setForm((f) => ({ ...f, default_unit_price: Number(e.target.value) }))}
            className="w-32 border border-ink-200 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={addProduct}
            disabled={saving}
            className="flex items-center gap-1.5 bg-ink-900 hover:bg-ink-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            <Plus size={14} /> Add product
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-ink-200">
        <div className="px-5 py-4 border-b border-ink-200">
          <p className="text-sm font-semibold text-ink-900">Your products</p>
        </div>
        {loading ? (
          <p className="text-sm text-ink-500 px-5 py-4">Loading...</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-ink-500 px-5 py-4">No products yet — add your first one above.</p>
        ) : (
          <div className="max-h-[32rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="text-left text-xs text-ink-500 border-b border-ink-200">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium text-right">Default price</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const isEditing = editingId === p.id
                  return (
                    <tr key={p.id} className="border-b border-ink-100 last:border-b-0">
                      <td className="px-5 py-3 text-ink-800 font-medium">{p.name}</td>
                      <td className="px-5 py-3 text-ink-600">
                        {isEditing ? (
                          <input
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            placeholder="Category"
                            className="w-32 border border-ink-200 rounded-lg px-2 py-1 text-sm"
                          />
                        ) : (
                          p.category || '—'
                        )}
                      </td>
                      <td className="px-5 py-3 text-right text-ink-600">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            placeholder="Price"
                            className="w-28 border border-ink-200 rounded-lg px-2 py-1 text-sm text-right"
                            autoFocus
                          />
                        ) : p.default_unit_price > 0 ? (
                          currency(p.default_unit_price)
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => saveEdit(p.id)}
                              disabled={savingEdit}
                              className="text-teal-600 hover:text-teal-800 disabled:opacity-50"
                              title="Save"
                            >
                              <Check size={16} />
                            </button>
                            <button onClick={cancelEdit} className="text-ink-400 hover:text-ink-700" title="Cancel">
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-3">
                            <button onClick={() => startEdit(p)} className="text-ink-400 hover:text-brand-600" title="Edit">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => removeProduct(p.id)} className="text-ink-400 hover:text-rose-600" title="Delete">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
