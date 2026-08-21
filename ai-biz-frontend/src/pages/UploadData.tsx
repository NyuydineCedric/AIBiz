import { useEffect, useRef, useState } from 'react'
import { UploadCloud, Trash2 } from 'lucide-react'
import * as api from '../lib/api'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function UploadData() {
  const [datasets, setDatasets] = useState<api.Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDatasets = () => {
    api
      .listUploads()
      .then(setDatasets)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load uploads.'))
      .finally(() => setLoading(false))
  }

  useEffect(loadDatasets, [])

  const doUpload = async (file: File) => {
    setError('')
    setUploading(true)
    try {
      await api.uploadFile(file)
      loadDatasets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) doUpload(file)
    e.target.value = ''
  }

  const handleDelete = async (dataset: api.Dataset) => {
    if (!window.confirm(`Delete "${dataset.filename}"? This also removes its chat history and can't be undone.`)) {
      return
    }
    setError('')
    setDeletingId(dataset.id)
    try {
      await api.deleteDataset(dataset.id)
      setDatasets((prev) => prev.filter((d) => d.id !== dataset.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp,image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const file = e.dataTransfer.files?.[0]
          if (file) doUpload(file)
        }}
        className={`border-2 border-dashed rounded-xl bg-white p-12 text-center transition ${
          dragOver ? 'border-brand-600 bg-brand-50' : 'border-ink-300'
        }`}
      >
        <UploadCloud size={40} className="text-brand-500 mx-auto mb-3" />
        <p className="text-sm font-semibold text-ink-800">Drag and drop files here</p>
        <p className="text-xs text-ink-500 mt-1 mb-4">
          Supports CSV, Excel (.xlsx), PDF, and photos/screenshots (JPG, PNG, WEBP) up to 25MB — images are read by
          AI to pull out numbers automatically
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          {uploading ? 'Uploading...' : 'Browse files'}
        </button>
      </div>

      {error && (
        <div className="mt-4 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-4 py-3">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-ink-200 mt-6">
        <div className="px-5 py-4 border-b border-ink-200">
          <p className="text-sm font-semibold text-ink-900">Recent uploads</p>
        </div>
        {loading ? (
          <p className="text-sm text-ink-500 px-5 py-4">Loading...</p>
        ) : datasets.length === 0 ? (
          <p className="text-sm text-ink-500 px-5 py-4">No files uploaded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-500 border-b border-ink-200">
                <th className="px-5 py-3 font-medium">File</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Size</th>
                <th className="px-5 py-3 font-medium">Uploaded</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((d, i) => (
                <tr key={d.id} className={i !== datasets.length - 1 ? 'border-b border-ink-100' : ''}>
                  <td className="px-5 py-3 text-ink-800 font-medium">{d.filename}</td>
                  <td className="px-5 py-3 text-ink-500">{d.file_type}</td>
                  <td className="px-5 py-3 text-ink-500">{formatSize(d.size_bytes)}</td>
                  <td className="px-5 py-3 text-ink-500">{formatDate(d.created_at)}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        d.status === 'parsed'
                          ? 'text-teal-700 bg-teal-100'
                          : d.status === 'error'
                          ? 'text-rose-700 bg-rose-100'
                          : 'text-amber-700 bg-amber-100'
                      }`}
                    >
                      {d.status === 'parsed' ? 'Parsed' : d.status === 'error' ? 'Error' : 'Processing...'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleDelete(d)}
                      disabled={deletingId === d.id}
                      aria-label={`Delete ${d.filename}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-ink-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
