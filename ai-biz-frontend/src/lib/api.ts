const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000'
const TOKEN_KEY = 'ai_biz_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const data = await res.json()
      detail = data.detail || detail
    } catch {
      // response wasn't JSON, keep statusText
    }
    throw new ApiError(detail, res.status)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ---------- Types ----------

export type User = {
  id: string
  full_name: string
  email: string
  role: string
  organization_id: string
}

export type Kpi = { label: string; value: string; change: string; trend: 'up' | 'down' | 'warn' }
export type Series = { labels: string[]; values: number[] }
export type Insight = { id: string; type: string; severity: string; text: string }
export type DashboardSummary = {
  has_data: boolean
  kpis: Kpi[]
  executive_summary: string
  revenue_trend: Series
  region_breakdown: Series
  risks: Insight[]
  recommendations: Insight[]
}
export type Dataset = {
  id: string
  filename: string
  file_type: string
  status: string
  row_count: number
  column_count: number
  columns: string[]
  size_bytes: number
  created_at: string
}
export type ChatMessage = { id: string; role: 'user' | 'ai'; text: string; created_at: string }
export type Report = {
  id: string
  title: string
  description: string
  report_type: string
  created_at: string
  has_pdf: boolean
  has_xlsx: boolean
}
export type NotificationPreferences = {
  risk_alerts: boolean
  weekly_report_emails: boolean
  forecast_updates: boolean
}
export type Organization = { name: string; industry: string }

// ---------- Auth ----------

export async function signup(payload: {
  full_name: string
  company: string
  email: string
  password: string
}) {
  const data = await request<{ access_token: string; user: User }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  setToken(data.access_token)
  return data.user
}

export async function login(payload: { email: string; password: string }) {
  const data = await request<{ access_token: string; user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  setToken(data.access_token)
  return data.user
}

export function getMe() {
  return request<User>('/api/auth/me')
}

// ---------- Uploads ----------

export function uploadFile(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return request<Dataset>('/api/uploads', { method: 'POST', body: formData })
}

export function listUploads() {
  return request<Dataset[]>('/api/uploads')
}

// ---------- Dashboard ----------

export function getDashboardSummary() {
  return request<DashboardSummary>('/api/dashboard/summary')
}

// ---------- Chat ----------

export function askQuestion(question: string) {
  return request<{ answer: string; history: ChatMessage[] }>('/api/chat/ask', {
    method: 'POST',
    body: JSON.stringify({ question }),
  })
}

export function getChatHistory() {
  return request<ChatMessage[]>('/api/chat/history')
}

// ---------- Reports ----------

export function listReports() {
  return request<Report[]>('/api/reports')
}

export function generateReport(reportType: string) {
  return request<Report>('/api/reports/generate', {
    method: 'POST',
    body: JSON.stringify({ report_type: reportType }),
  })
}

export async function downloadReport(reportId: string, format: 'pdf' | 'xlsx', filename: string) {
  const token = getToken()
  const res = await fetch(`${API_BASE}/api/reports/${reportId}/download?format=${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new ApiError('Failed to download report', res.status)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.${format}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ---------- Settings ----------

export function getProfile() {
  return request<User>('/api/settings/profile')
}
export function updateProfile(payload: { full_name?: string; email?: string }) {
  return request<User>('/api/settings/profile', { method: 'PUT', body: JSON.stringify(payload) })
}
export function getOrganization() {
  return request<Organization>('/api/settings/organization')
}
export function updateOrganization(payload: { name?: string; industry?: string }) {
  return request<Organization>('/api/settings/organization', { method: 'PUT', body: JSON.stringify(payload) })
}
export function getNotifications() {
  return request<NotificationPreferences>('/api/settings/notifications')
}
export function updateNotifications(payload: Partial<NotificationPreferences>) {
  return request<NotificationPreferences>('/api/settings/notifications', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}
