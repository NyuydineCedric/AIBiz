import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/app/dashboard')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log in. Check the backend is running.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-50 px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <Logo />
          <span className="font-bold text-lg text-ink-900">AI Biz</span>
        </div>
        <div className="bg-white border border-ink-200 rounded-2xl p-8 shadow-sm">
          <h1 className="text-xl font-bold text-ink-900 mb-1">Welcome back</h1>
          <p className="text-sm text-ink-500 mb-6">Log in to your AI Biz account</p>

          {error && (
            <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-ink-700 block mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full border border-ink-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-700 block mb-1.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full border border-ink-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-ink-600">
                <input type="checkbox" className="rounded border-ink-300" /> Remember me
              </label>
              <a href="#" className="text-brand-600 font-medium hover:underline">
                Forgot password?
              </a>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition text-sm"
            >
              {submitting ? 'Logging in...' : 'Log in'}
            </button>
          </form>
          <p className="text-center text-sm text-ink-500 mt-6">
            Don't have an account?{' '}
            <button onClick={() => navigate('/signup')} className="text-brand-600 font-medium hover:underline">
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
