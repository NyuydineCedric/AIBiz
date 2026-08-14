import { useEffect, useRef, useState } from "react";
import {
  Zap,
  Send,
  Volume2,
  VolumeX,
  MessageSquare,
  FileText,
  Upload,
} from "lucide-react";
import * as api from "../lib/api";

export default function AskQuestion() {
  const [sessions, setSessions] = useState<api.ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<api.ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Load the list of chat sessions (one per uploaded document) on mount.
  useEffect(() => {
    api
      .listChatSessions()
      .then((list) => {
        setSessions(list);
        if (list.length > 0) {
          setActiveSessionId(list[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSessions(false));
  }, []);

  // Load messages whenever the active session changes.
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    window.speechSynthesis?.cancel();
    setSpeakingId(null);
    api
      .getSessionMessages(activeSessionId)
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setLoadingMessages(false));
  }, [activeSessionId]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      setSpeakingId(null);
    };
  }, []);

  const speak = (id: string, text: string) => {
    if (!("speechSynthesis" in window)) return;

    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    setSpeakingId(null);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () =>
      setSpeakingId((current) => (current === id ? null : current));
    utterance.onerror = () =>
      setSpeakingId((current) => (current === id ? null : current));

    window.setTimeout(() => {
      setSpeakingId(id);
      window.speechSynthesis.speak(utterance);
    }, 50);
  };

  const ask = async (question: string) => {
    if (!activeSessionId) return;

    window.speechSynthesis?.cancel();
    setSpeakingId(null);

    setSending(true);
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        role: "user",
        text: question,
        created_at: new Date().toISOString(),
      },
    ]);
    try {
      const res = await api.askQuestionInSession(activeSessionId, question);
      setMessages(res.history);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `local-error-${Date.now()}`,
          role: "ai",
          text:
            err instanceof Error
              ? err.message
              : "Something went wrong answering that.",
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const sendChat = () => {
    const val = input.trim();
    if (!val || sending || !activeSessionId) return;
    setInput("");
    ask(val);
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  return (
    <div className="p-6 flex gap-4 h-[calc(100vh-96px)]">
      {/* Sidebar: chat history, one entry per uploaded document */}
      <div className="w-72 shrink-0 bg-white rounded-xl border border-ink-200 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-200">
          <p className="text-sm font-semibold text-ink-900">Chats</p>
          <p className="text-xs text-ink-500">
            One thread per uploaded document
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingSessions ? (
            <p className="text-xs text-ink-500 px-4 py-3">Loading chats...</p>
          ) : sessions.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <Upload size={22} className="text-ink-300 mx-auto mb-2" />
              <p className="text-xs text-ink-500">
                Upload a document to start your first chat.
              </p>
            </div>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSessionId(s.id)}
                className={`w-full text-left px-4 py-3 border-b border-ink-100 transition flex items-start gap-2.5 ${
                  s.id === activeSessionId ? "bg-brand-50" : "hover:bg-ink-50"
                }`}
              >
                <MessageSquare
                  size={15}
                  className={`shrink-0 mt-0.5 ${s.id === activeSessionId ? "text-brand-600" : "text-ink-400"}`}
                />
                <div className="min-w-0">
                  <p
                    className={`text-sm truncate ${
                      s.id === activeSessionId
                        ? "text-brand-700 font-semibold"
                        : "text-ink-800 font-medium"
                    }`}
                  >
                    {s.title}
                  </p>
                  {s.dataset_filename && (
                    <p className="text-xs text-ink-400 truncate flex items-center gap-1 mt-0.5">
                      <FileText size={11} className="shrink-0" />
                      {s.dataset_filename}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main chat panel */}
      <div className="flex-1 bg-white rounded-xl border border-ink-200 flex flex-col min-w-0">
        {!activeSession ? (
          <div className="flex-1 flex items-center justify-center text-sm text-ink-500 px-6 text-center">
            Upload a business report to start a chat about it.
          </div>
        ) : (
          <>
            <div className="px-5 py-3.5 border-b border-ink-200">
              <p className="text-sm font-semibold text-ink-900">
                {activeSession.title}
              </p>
              {activeSession.dataset_filename && (
                <p className="text-xs text-ink-500">
                  {activeSession.dataset_filename}
                </p>
              )}
            </div>
            <div ref={bodyRef} className="flex-1 overflow-y-auto p-6 space-y-5">
              {loadingMessages ? (
                <p className="text-sm text-ink-500">Loading conversation...</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-ink-500">
                  Ask a question about{" "}
                  {activeSession.dataset_filename ?? "this document"} below.
                </p>
              ) : (
                messages.map((m) =>
                  m.role === "user" ? (
                    <div key={m.id} className="flex justify-end">
                      <div className="bg-brand-600 text-white text-sm rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-md">
                        {m.text}
                      </div>
                    </div>
                  ) : (
                    <div key={m.id} className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center shrink-0 mt-0.5">
                        <Zap size={14} className="text-white" />
                      </div>
                      <div className="flex items-end gap-1.5 max-w-md">
                        <div className="bg-ink-100 text-ink-800 text-sm rounded-2xl rounded-tl-sm px-4 py-2.5">
                          {m.text}
                        </div>
                        <button
                          type="button"
                          onClick={() => speak(m.id, m.text)}
                          title={
                            speakingId === m.id ? "Stop reading" : "Read aloud"
                          }
                          className="shrink-0 mb-1 w-6 h-6 rounded-full flex items-center justify-center text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition"
                        >
                          {speakingId === m.id ? (
                            <VolumeX size={14} />
                          ) : (
                            <Volume2 size={14} />
                          )}
                        </button>
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
                  <div className="bg-ink-100 text-ink-500 text-sm rounded-2xl rounded-tl-sm px-4 py-2.5">
                    Thinking...
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-ink-200 p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendChat();
                }}
                className="flex gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  type="text"
                  placeholder={`Ask about ${activeSession.dataset_filename ?? "this document"}...`}
                  className="flex-1 border border-ink-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-lg transition"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
