"use client";

import { useRef, useState, useEffect } from "react";
import { Send, Trash2 } from "lucide-react";

// Sprite: 1369×439px — 5 poses side by side (same constants as AiRimauChat)
const SPRITE_H = 130;
const SPRITE_W = Math.round((1369 / 439) * SPRITE_H); // ≈ 405
const FRAME_W  = SPRITE_W / 5;                        // ≈ 81
const POSES    = 5;

/** Renders one frame of the AI Rimau sprite sheet at the given scale. */
function RimauSprite({ pose, scale }: { pose: number; scale: number }) {
  const h  = Math.round(SPRITE_H * scale);
  const w  = Math.round(SPRITE_W * scale);
  const fw = Math.round(FRAME_W  * scale);
  return (
    <div
      style={{
        width:              fw,
        height:             h,
        backgroundImage:    "url('/ai-rimau/ai-rimau-5-pose-01.png')",
        backgroundSize:     `${w}px ${h}px`,
        backgroundPosition: `${-(pose * fw)}px 0`,
        backgroundRepeat:   "no-repeat",
        flexShrink:         0,
      }}
    />
  );
}

type Message = {
  role: "user" | "assistant";
  content: string;
  pose?: number; // fixed sprite pose for this assistant message
};

const QUICK_QUESTIONS = [
  "Apakah jadual pertandingan saya?",
  "Siapa ahli pasukan saya?",
  "Di mana tempat pertandingan?",
  "Siapa jurulatih saya?",
];

function randomPose() { return Math.floor(Math.random() * POSES); }

export function ChatClient() {
  const [messages, setMessages] = useState<Message[]>(() => [
    { role: "assistant", content: "Halo! Saya AI Rimau, pembantu pintar Techlympics. Saya boleh membantu anda tentang pertandingan, jadual, pasukan, dan lain-lain. Apa yang boleh saya bantu?", pose: randomPose() },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pose, setPose] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cycle sprite pose every 3 s
  useEffect(() => {
    const id = setInterval(() => setPose((p) => (p + 1) % POSES), 3000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll on new message or loading
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
      setMessages((prev) => [...prev, { role: "assistant", content: reply, pose: randomPose() }]);
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
    setMessages([{ role: "assistant", content: "Halo! Saya AI Rimau, pembantu pintar Techlympics. Saya boleh membantu anda tentang pertandingan, jadual, pasukan, dan lain-lain. Apa yang boleh saya bantu?", pose: randomPose() }]);
    setInput("");
    setError(null);
    inputRef.current?.focus();
  }

  // Avatar bubble: container clips to circle, sprite slightly larger so the
  // character fills the frame (same translateY trick as AiRimauChat header mini)
  const AVATAR_SCALE = 0.44; // h≈57px, fw≈36px — container clips to 36×36
  const avatarFw = Math.round(FRAME_W * AVATAR_SCALE);

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex items-end gap-3 mb-3">
        {/* Larger animated sprite for the header */}
        <RimauSprite pose={pose} scale={0.6} />
        <div className="pb-1">
          <h1 className="text-xl font-bold leading-tight">AI Rimau</h1>
          <p className="text-sm text-muted-foreground">Tanya apa sahaja tentang Techlympics</p>
        </div>
        {/* Clear button pushed to far right */}
        <div className="ml-auto pb-1">
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
      </div>

      {/* ── Message area ────────────────────────────────────────────────────── */}
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
              {/* Avatar: clipped circle, fixed pose per message */}
              <div
                className="shrink-0 rounded-full bg-[#085782]/10 dark:bg-blue-950/40 overflow-hidden"
                style={{ width: avatarFw, height: avatarFw }}
              >
                <div style={{ transform: "translateY(4px)" }}>
                  <RimauSprite pose={msg.pose ?? 0} scale={AVATAR_SCALE} />
                </div>
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
            <div
              className="shrink-0 rounded-full bg-[#085782]/10 dark:bg-blue-950/40 overflow-hidden"
              style={{ width: avatarFw, height: avatarFw }}
            >
              <div style={{ transform: "translateY(4px)" }}>
                <RimauSprite pose={pose} scale={AVATAR_SCALE} />
              </div>
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

      {/* ── Input row ───────────────────────────────────────────────────────── */}
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
