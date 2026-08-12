import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import * as api from '../lib/api'

type AuthContextType = {
  user: api.User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (fullName: string, company: string, email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<api.User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = api.getToken()
    if (!token) {
      setLoading(false)
      return
    }
    api
      .getMe()
      .then(setUser)
      .catch(() => api.clearToken())
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const u = await api.login({ email, password })
    setUser(u)
  }

  const signup = async (fullName: string, company: string, email: string, password: string) => {
    const u = await api.signup({ full_name: fullName, company, email, password })
    setUser(u)
  }

  const logout = () => {
    api.clearToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
