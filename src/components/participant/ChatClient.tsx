"use client";

import { useRef, useState, useEffect } from "react";
import { MessageCircle, Send, Trash2 } from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const WELCOME: Message = {
  role: "assistant",
  content:
    "Halo! Saya Smart Chat Techlympics. Saya boleh membantu anda tentang pertandingan, jadual, pasukan, dan lain-lain. Apa yang boleh saya bantu?",
};

const QUICK_QUESTIONS = [
  "Apakah jadual pertandingan saya?",
  "Siapa ahli pasukan saya?",
  "Di mana tempat pertandingan?",
  "Siapa jurulatih saya?",
];

export function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll whenever messages change or loading state changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const hasUserMessage = messages.some((m) => m.role === "user");

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError(null);
    const userMsg: Message = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/v2/participant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }

      const { reply } = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ralat tidak dijangka. Sila cuba lagi."
      );
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleClear() {
    setMessages([WELCOME]);
    setInput("");
    setError(null);
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      {/* Clear button */}
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={handleClear}
          disabled={messages.length <= 1}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Kosongkan
        </button>
      </div>

      {/* Message area */}
      <div className="flex-1 overflow-y-auto space-y-3 py-4 pr-1">
        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm bg-[#085782] text-white shadow-sm">
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-2">
              <div className="shrink-0 mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#085782]/10 dark:bg-blue-950/40">
                <MessageCircle className="h-4 w-4 text-[#085782] dark:text-blue-400" strokeWidth={1.8} />
              </div>
              <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm whitespace-pre-wrap">
                {msg.content}
              </div>
            </div>
          )
        )}

        {/* Typing indicator */}
        {loading && (
          <div className="flex items-start gap-2">
            <div className="shrink-0 mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#085782]/10 dark:bg-blue-950/40">
              <MessageCircle className="h-4 w-4 text-[#085782] dark:text-blue-400" strokeWidth={1.8} />
            </div>
            <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-zinc-100 dark:bg-zinc-800 shadow-sm">
              <span className="flex gap-1 items-center h-4">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce" />
              </span>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex justify-center">
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-lg px-3 py-2">
              {error}
            </p>
          </div>
        )}

        {/* Quick-question chips — only before first user message */}
        {!hasUserMessage && !loading && (
          <div className="flex flex-wrap gap-2 mt-2">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => sendMessage(q)}
                className="rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:border-[#085782] hover:text-[#085782] dark:hover:border-blue-400 dark:hover:text-blue-400 transition-colors shadow-sm"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <form
        onSubmit={handleSubmit}
        className="border-t dark:border-zinc-800 pt-3 flex gap-2"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Taip mesej anda…"
          disabled={loading}
          className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#085782]/50 dark:focus:ring-blue-500/40 focus:border-[#085782] dark:focus:border-blue-500 disabled:opacity-50 transition"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-[#085782] text-white hover:bg-[#074f73] active:bg-[#063e5c] disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-[#085782]/50"
          aria-label="Hantar"
        >
          <Send className="h-4 w-4" strokeWidth={2} />
        </button>
      </form>
    </div>
  );
}
