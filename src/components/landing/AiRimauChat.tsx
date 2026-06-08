"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Send, X, Minimize2 } from "lucide-react";

// Sprite: 1369×439px, 5 poses side by side
// Display height: 130px → scale factor: 130/439 ≈ 0.2962
// Display width of full sheet: 1369 × 0.2962 ≈ 405px
// Each frame width: 405 / 5 = 81px
const SPRITE_DISPLAY_H = 130;
const SPRITE_DISPLAY_W = Math.round((1369 / 439) * SPRITE_DISPLAY_H); // 405px
const FRAME_W = SPRITE_DISPLAY_W / 5; // 81px
const POSES = 5;

type Message = {
  role: "user" | "assistant";
  content: string;
};

// Simple markdown → JSX: bold (**text**) and newlines
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  return lines.map((line, li) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <span key={li}>
        {parts.map((part, i) =>
          part.startsWith("**") && part.endsWith("**")
            ? <strong key={i}>{part.slice(2, -2)}</strong>
            : part
        )}
        {li < lines.length - 1 && line.trim() !== "" && <br />}
      </span>
    );
  });
}

export function AiRimauChat() {
  const t = useTranslations("landing");
  const [open, setOpen]       = useState(false);
  const [pose, setPose]       = useState(0);
  const [showBubble, setShowBubble] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => [
    { role: "assistant", content: t("rimauChatWelcome") },
  ]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // History in eptim format (last 10 turns)
  const chatHistory = useCallback(() =>
    messages.slice(-10).map((m) => ({
      role: m.role === "user" ? "user" : "assistant" as "user" | "assistant",
      content: m.content,
    })), [messages]);

  // Cycle pose every 3 seconds
  useEffect(() => {
    const id = setInterval(() => {
      setPose((p) => (p + 1) % POSES);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // Show idle bubble after 2s, hide after 6s, repeat every 14s
  useEffect(() => {
    if (open) { setShowBubble(false); return; }
    const show = setTimeout(() => setShowBubble(true), 2000);
    const hide = setTimeout(() => setShowBubble(false), 8000);
    const cycle = setInterval(() => {
      setShowBubble(true);
      setTimeout(() => setShowBubble(false), 6000);
    }, 14000);
    return () => { clearTimeout(show); clearTimeout(hide); clearInterval(cycle); };
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/v2/public/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: chatHistory() }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply ?? t("rimauChatError") },
      ]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: t("rimauChatError") }]);
    } finally {
      setLoading(false);
    }
  }

  const spriteX = -(pose * FRAME_W);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 28,
        right: 28,
        zIndex: 9000,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 0,
        pointerEvents: "none",
      }}
    >
      {/* ── Chat Panel ──────────────────────────────────────────────────────── */}
      <div
        style={{
          width: 360,
          maxHeight: open ? 500 : 0,
          opacity: open ? 1 : 0,
          overflow: "hidden",
          transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease",
          pointerEvents: open ? "auto" : "none",
          marginBottom: 12,
          borderRadius: 16,
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          border: "1px solid rgba(0,56,147,0.12)",
        }}
      >
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, #003893 0%, #001f5c 100%)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}>
          {/* Mini sprite in header */}
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "rgba(255,255,255,0.12)",
            overflow: "hidden", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              width: FRAME_W * 0.44,
              height: SPRITE_DISPLAY_H * 0.44,
              backgroundImage: "url('/ai-rimau/ai-rimau-5-pose-01.png')",
              backgroundSize: `${SPRITE_DISPLAY_W * 0.44}px ${SPRITE_DISPLAY_H * 0.44}px`,
              backgroundPosition: `${spriteX * 0.44}px 0`,
              backgroundRepeat: "no-repeat",
              transform: "translateY(4px)",
            }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "0.85rem", color: "#fff", letterSpacing: "0.03em" }}>
              {t("rimauChatTitle")}
            </p>
            <p style={{ margin: 0, fontSize: "0.7rem", color: "rgba(255,255,255,0.6)" }}>
              {t("rimauChatSubtitle")}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label={t("rimauChatClose")}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", padding: 4, display: "flex" }}
          >
            <Minimize2 size={16} />
          </button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minHeight: 200,
          maxHeight: 340,
        }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}>
              <div style={{
                maxWidth: "82%",
                padding: "9px 13px",
                borderRadius: msg.role === "user"
                  ? "14px 14px 4px 14px"
                  : "14px 14px 14px 4px",
                background: msg.role === "user" ? "#003893" : "#f1f5f9",
                color: msg.role === "user" ? "#fff" : "#111827",
                fontSize: "0.82rem",
                lineHeight: 1.6,
              }}>
                {renderMarkdown(msg.content)}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ padding: "10px 14px", borderRadius: "14px 14px 14px 4px", background: "#f1f5f9" }}>
                <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {[0, 1, 2].map((d) => (
                    <span key={d} style={{
                      width: 6, height: 6, borderRadius: "50%", background: "#003893",
                      opacity: 0.6,
                      animation: `rimauDot 1.2s ease-in-out ${d * 0.2}s infinite`,
                    }} />
                  ))}
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: "10px 12px",
          borderTop: "1px solid #f1f5f9",
          display: "flex",
          gap: 8,
          flexShrink: 0,
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder={t("rimauChatPlaceholder")}
            disabled={loading}
            style={{
              flex: 1,
              border: "1px solid #e5e7eb",
              borderRadius: 20,
              padding: "8px 14px",
              fontSize: "0.82rem",
              outline: "none",
              background: "#f8fafc",
              color: "#111827",
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            aria-label={t("rimauChatSend")}
            style={{
              width: 36, height: 36,
              borderRadius: "50%",
              background: input.trim() && !loading ? "#003893" : "#e5e7eb",
              border: "none",
              cursor: input.trim() && !loading ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              transition: "background 0.2s",
            }}
          >
            <Send size={15} color={input.trim() && !loading ? "#fff" : "#9ca3af"} />
          </button>
        </div>
      </div>

      {/* ── Idle speech bubble ───────────────────────────────────────────────── */}
      {!open && (
        <div style={{
          pointerEvents: "none",
          position: "absolute",
          bottom: SPRITE_DISPLAY_H + 20,
          right: 0,
          opacity: showBubble ? 1 : 0,
          transform: showBubble ? "translateY(0) scale(1)" : "translateY(8px) scale(0.95)",
          transition: "opacity 0.3s ease, transform 0.3s ease",
          background: "#fff",
          border: "1px solid rgba(0,56,147,0.15)",
          borderRadius: "14px 14px 4px 14px",
          padding: "8px 14px",
          fontSize: "0.78rem",
          fontWeight: 600,
          color: "#003893",
          whiteSpace: "nowrap",
          boxShadow: "0 4px 16px rgba(0,56,147,0.12)",
        }}>
          {t("rimauChatBubble")}
          {/* Tail */}
          <div style={{
            position: "absolute", bottom: -8, right: 12,
            width: 0, height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "0 solid transparent",
            borderTop: "8px solid #fff",
            filter: "drop-shadow(0 1px 1px rgba(0,56,147,0.1))",
          }} />
        </div>
      )}

      {/* ── Floating mascot button ──────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? t("rimauChatClose") : t("rimauChatBubble")}
        style={{
          pointerEvents: "auto",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* Sprite with white glow outline */}
        <div style={{
          width: FRAME_W,
          height: SPRITE_DISPLAY_H,
          backgroundImage: "url('/ai-rimau/ai-rimau-5-pose-01.png')",
          backgroundSize: `${SPRITE_DISPLAY_W}px ${SPRITE_DISPLAY_H}px`,
          backgroundPosition: `${spriteX}px 0`,
          backgroundRepeat: "no-repeat",
          filter: [
            "drop-shadow(0  2px 0 #fff)",
            "drop-shadow(0 -2px 0 #fff)",
            "drop-shadow( 2px 0 0 #fff)",
            "drop-shadow(-2px 0 0 #fff)",
            "drop-shadow(0 0 8px rgba(255,255,255,0.9))",
            "drop-shadow(0 0 16px rgba(255,255,255,0.5))",
            "drop-shadow(0 6px 12px rgba(0,0,0,0.25))",
          ].join(" "),
          transition: "filter 0.2s, transform 0.2s",
        }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.transform = "scale(1.08) translateY(-2px)";
            (e.currentTarget as HTMLDivElement).style.filter = [
              "drop-shadow(0  2px 0 #fff)",
              "drop-shadow(0 -2px 0 #fff)",
              "drop-shadow( 2px 0 0 #fff)",
              "drop-shadow(-2px 0 0 #fff)",
              "drop-shadow(0 0 14px rgba(255,255,255,1))",
              "drop-shadow(0 0 28px rgba(255,255,255,0.7))",
              "drop-shadow(0 8px 18px rgba(0,0,0,0.3))",
            ].join(" ");
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.transform = "";
            (e.currentTarget as HTMLDivElement).style.filter = [
              "drop-shadow(0  2px 0 #fff)",
              "drop-shadow(0 -2px 0 #fff)",
              "drop-shadow( 2px 0 0 #fff)",
              "drop-shadow(-2px 0 0 #fff)",
              "drop-shadow(0 0 8px rgba(255,255,255,0.9))",
              "drop-shadow(0 0 16px rgba(255,255,255,0.5))",
              "drop-shadow(0 6px 12px rgba(0,0,0,0.25))",
            ].join(" ");
          }}
        />

        {/* Online dot */}
        <div style={{
          position: "absolute",
          top: 0, right: 0,
          width: 12, height: 12,
          borderRadius: "50%",
          background: "#22c55e",
          border: "2px solid rgba(0,0,0,0.2)",
          boxShadow: "0 0 8px rgba(34,197,94,0.8)",
          animation: "rimauPulse 2s ease-in-out infinite",
        }} />
      </button>

      {/* Keyframe animations */}
      <style>{`
        @keyframes rimauPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.7; }
        }
        @keyframes rimauDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
