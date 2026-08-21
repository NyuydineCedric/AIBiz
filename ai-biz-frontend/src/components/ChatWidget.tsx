import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, X, Send, Zap, Maximize2 } from 'lucide-react'
import * as api from '../lib/api'

const QUICK_QUESTIONS = [
  "What's the revenue forecast for next quarter?",
  'Which region is performing best?',
  'What are the biggest risks right now?',
]

export default function ChatWidget() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [session, setSession] = useState<api.ChatSession | null>(null)
  const [messages, setMessages] = useState<api.ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Lazily load the most recent chat session the first time the widget opens.
  useEffect(() => {
    if (!open || loadedOnce) return
    setLoading(true)
    api
      .listChatSessions()
      .then((list) => {
        const latest = list[0] ?? null
        setSession(latest)
        if (latest) {
          return api.getSessionMessages(latest.id).then(setMessages)
        }
        return undefined
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false)
        setLoadedOnce(true)
      })
  }, [open, loadedOnce])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [messages, open])

  const ask = async (question: string) => {
    if (!session) return
    setSending(true)
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: 'user', text: question, created_at: new Date().toISOString() },
    ])
    try {
      const res = await api.askQuestionInSession(session.id, question)
      setMessages(res.history)
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `local-error-${Date.now()}`,
          role: 'ai',
          text: err instanceof Error ? err.message : 'Something went wrong answering that.',
          created_at: new Date().toISOString(),
        },
      ])
    } finally {
      setSending(false)
    }
  }

  const sendChat = () => {
    const val = input.trim()
    if (!val || sending || !session) return
    setInput('')
    ask(val)
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-28 right-6 w-[26rem] sm:w-[30rem] h-[42rem] max-h-[80vh] bg-white rounded-2xl border border-ink-200 shadow-2xl flex flex-col overflow-hidden z-50">
          <div className="px-5 py-4 border-b border-ink-200 flex items-center justify-between bg-brand-600">
            <div className="min-w-0">
              <p className="text-base font-semibold text-white truncate">{session?.title ?? 'AI Assistant'}</p>
              {session?.dataset_filename && (
                <p className="text-xs text-brand-100 truncate mt-0.5">{session.dataset_filename}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => navigate('/app/ask')}
                title="Open full chat"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-100 hover:text-white hover:bg-brand-700 transition"
              >
                <Maximize2 size={16} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Close"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-100 hover:text-white hover:bg-brand-700 transition"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div ref={bodyRef} className="flex-1 overflow-y-auto p-5 space-y-4">
            {loading ? (
              <p className="text-sm text-ink-500">Loading...</p>
            ) : !session ? (
              <p className="text-sm text-ink-500">Upload a business report to start a chat about it.</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-ink-500">Ask a question about {session.dataset_filename ?? 'this document'} below.</p>
            ) : (
              messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="bg-brand-600 text-white text-sm rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[85%] leading-relaxed">
                      {m.text}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Zap size={14} className="text-white" />
                    </div>
                    <div className="bg-ink-100 text-ink-800 text-sm rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[85%] leading-relaxed">
                      {m.text}
                    </div>
                  </div>
                ),
              )
            )}
            {sending && (
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Zap size={14} className="text-white" />
                </div>
                <div className="bg-ink-100 text-ink-500 text-sm rounded-2xl rounded-tl-sm px-4 py-2.5">Thinking...</div>
              </div>
            )}
          </div>

          {session && (
            <div className="border-t border-ink-200 p-4">
              <div className="flex flex-wrap gap-2 mb-3">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => ask(q)}
                    disabled={sending}
                    className="text-xs text-brand-700 bg-brand-50 hover:bg-brand-100 disabled:opacity-60 border border-brand-100 rounded-full px-3 py-1.5 transition"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  sendChat()
                }}
                className="flex gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  type="text"
                  placeholder="Ask a question..."
                  className="flex-1 border border-ink-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-lg transition shrink-0"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={open ? 'Close chat' : 'Ask AI'}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-700 text-white shadow-xl flex items-center justify-center transition z-50"
      >
        {open ? <X size={22} /> : <MessageSquare size={22} />}
      </button>
    </>
  )
}
