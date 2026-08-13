import { useEffect, useRef, useState } from "react";
import { Zap, Send, Volume2, VolumeX } from "lucide-react";
import * as api from "../lib/api";

const SUGGESTED_QUESTIONS = [
  "What caused the drop in sales last month?",
  "Predict next month's revenue",
  "Which branch needs improvement?",
];

export default function AskQuestion() {
  const [messages, setMessages] = useState<api.ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .getChatHistory()
      .then(setMessages)
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages]);

  // Stop any in-progress speech when the component unmounts (e.g. navigating away)
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      setSpeakingId(null);
    };
  }, []);

  const speak = (id: string, text: string) => {
    if (!("speechSynthesis" in window)) return;

    // If this message is currently speaking, clicking again means "stop" —
    // set state immediately rather than waiting on the onend event, since
    // some browsers (notably Chrome) don't reliably fire onend after cancel().
    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    // Switching to a different message: stop whatever's currently playing first.
    window.speechSynthesis.cancel();
    setSpeakingId(null);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () =>
      setSpeakingId((current) => (current === id ? null : current));
    utterance.onerror = () =>
      setSpeakingId((current) => (current === id ? null : current));

    // Chrome can silently drop speak() calls made in the same tick as a
    // cancel(); a short delay makes the cancel-then-speak sequence reliable.
    window.setTimeout(() => {
      setSpeakingId(id);
      window.speechSynthesis.speak(utterance);
    }, 50);
  };

  const ask = async (question: string) => {
    // Stop any message currently being read aloud before sending a new question
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
      const res = await api.askQuestion(question);
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
    if (!val || sending) return;
    setInput("");
    ask(val);
  };

  return (
    <div className="p-6">
      <div className="bg-white rounded-xl border border-ink-200 flex flex-col h-[calc(100vh-160px)]">
        <div ref={bodyRef} className="flex-1 overflow-y-auto p-6 space-y-5">
          {loadingHistory ? (
            <p className="text-sm text-ink-500">Loading conversation...</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-ink-500">
              Ask a question about your business data below, or try one of the
              suggestions.
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
          <div className="flex gap-2 flex-wrap mb-3">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => ask(q)}
                disabled={sending}
                className="text-xs text-ink-600 border border-ink-200 rounded-full px-3 py-1.5 transition hover:bg-brand-50 hover:border-brand-200 disabled:opacity-60"
              >
                {q}
              </button>
            ))}
          </div>
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
              placeholder="Ask a question about your business data..."
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
      </div>
    </div>
  );
}
