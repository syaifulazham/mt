"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, FileText, ExternalLink, Send, Trash2, User, Users, CheckCircle2, ChevronLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ── Types ──────────────────────────────────────────────────────────────────────

type Doc = { id: string; name: string; url: string };
type Competition = {
  id: string; code: string; name: string; description: string | null;
  participationType: string;
  venue: string | null; startDate: string | null; endDate: string | null;
  eptimEduCourseTitle: string | null;
  hasPpki: boolean; enrolled: boolean;
  theme: { name: string; color: string | null } | null;
  docs: Doc[];
};

// ── Sprite (AI Rimau) ──────────────────────────────────────────────────────────

const SPRITE_H = 130;
const SPRITE_W = Math.round((1369 / 439) * SPRITE_H);
const FRAME_W  = SPRITE_W / 5;
const POSES    = 5;

function RimauSprite({ pose, scale }: { pose: number; scale: number }) {
  const h  = Math.round(SPRITE_H * scale);
  const w  = Math.round(SPRITE_W * scale);
  const fw = Math.round(FRAME_W  * scale);
  return (
    <div style={{
      width: fw, height: h,
      backgroundImage:    "url('/ai-rimau/ai-rimau-5-pose-01.png')",
      backgroundSize:     `${w}px ${h}px`,
      backgroundPosition: `${-(pose * fw)}px 0`,
      backgroundRepeat:   "no-repeat",
      flexShrink: 0,
    }} />
  );
}

function randomPose() { return Math.floor(Math.random() * POSES); }

// ── AI Rimau mini chat ─────────────────────────────────────────────────────────

type ChatMsg = { role: "user" | "assistant"; content: string; pose?: number };

const QUICK_QUESTIONS = [
  "Terangkan konsep kertas ini",
  "Apakah kriteria penilaian?",
  "Format dan syarat penyertaan?",
  "Apakah tarikh penting?",
];

function MiniChat({ comp }: { comp: Competition }) {
  const firstDoc = comp.docs[0];
  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    {
      role: "assistant",
      content: `Halo! Saya AI Rimau. Tanya saya apa sahaja tentang **${comp.name}**${firstDoc ? " — saya telah membaca konsep kertasnya" : ""}. Apa yang ingin anda tahu?`,
      pose: randomPose(),
    },
  ]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [pose,    setPose]    = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setInterval(() => setPose(p => (p + 1) % POSES), 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const AVATAR_SCALE = 0.38;
  const avatarFw = Math.round(FRAME_W * AVATAR_SCALE);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    const next: ChatMsg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/v2/participant/competition-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages:      next,
          competitionId: comp.id,
          pdfUrl:        firstDoc?.url ?? null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const { reply } = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: reply, pose: randomPose() }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ralat tak dijangka.");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-zinc-800 bg-[#085782]/20">
        <RimauSprite pose={pose} scale={0.35} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white leading-tight">AI Rimau</p>
          <p className="text-[10px] text-zinc-400">Pembantu pintar Techlympics</p>
        </div>
        <button
          type="button"
          onClick={() => setMessages([{ role: "assistant", content: `Halo! Saya AI Rimau. Tanya saya apa sahaja tentang **${comp.name}**. Apa yang ingin anda tahu?`, pose: randomPose() }])}
          className="text-zinc-500 hover:text-red-400 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-2.5 px-3 py-3 min-h-0">
        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-3 py-2 text-xs bg-[#085782] text-white shadow-sm">
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-1.5">
              <div className="shrink-0 rounded-full bg-[#085782]/20 overflow-hidden" style={{ width: avatarFw, height: avatarFw }}>
                <div style={{ transform: "translateY(3px)" }}>
                  <RimauSprite pose={msg.pose ?? 0} scale={AVATAR_SCALE} />
                </div>
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-3 py-2 text-xs bg-zinc-800 text-zinc-100 shadow-sm prose prose-invert prose-xs max-w-none
                [&_p]:mb-1.5 [&_p:last-child]:mb-0
                [&_ul]:my-1 [&_ul]:pl-4 [&_ul]:list-disc
                [&_ol]:my-1 [&_ol]:pl-4 [&_ol]:list-decimal
                [&_li]:mb-0.5
                [&_strong]:font-semibold [&_strong]:text-white
                [&_h1]:text-sm [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-1
                [&_h2]:text-xs [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1
                [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-0.5
                [&_code]:bg-zinc-700 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[11px]
                [&_hr]:border-zinc-700 [&_hr]:my-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              </div>
            </div>
          )
        )}

        {loading && (
          <div className="flex items-start gap-1.5">
            <div className="shrink-0 rounded-full bg-[#085782]/20 overflow-hidden" style={{ width: avatarFw, height: avatarFw }}>
              <div style={{ transform: "translateY(3px)" }}><RimauSprite pose={pose} scale={AVATAR_SCALE} /></div>
            </div>
            <div className="rounded-2xl rounded-tl-sm px-3 py-2.5 bg-zinc-800 shadow-sm">
              <span className="flex gap-1 items-center h-3">
                {["-0.3s","-0.15s","0s"].map(d => (
                  <span key={d} className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: d }} />
                ))}
              </span>
            </div>
          </div>
        )}

        {error && (
          <p className="text-center text-[11px] text-red-400 bg-red-950/30 rounded-lg px-3 py-1.5">{error}</p>
        )}

        {/* Quick questions */}
        {messages.length === 1 && !loading && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {QUICK_QUESTIONS.map(q => (
              <button key={q} type="button" onClick={() => send(q)}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-[#085782] hover:text-sky-300 transition-colors">
                {q}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={e => { e.preventDefault(); send(input); }}
        className="border-t border-zinc-800 px-3 py-2.5 flex gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={loading}
          placeholder="Tanya tentang pertandingan ini…"
          className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#085782]/60 disabled:opacity-50"
        />
        <button type="submit" disabled={loading || !input.trim()}
          className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-[#085782] text-white hover:bg-[#074f73] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}

// ── Competition detail sheet ───────────────────────────────────────────────────

function CompetitionSheet({ comp, onClose }: { comp: Competition; onClose: () => void }) {
  const [activeDoc, setActiveDoc] = useState<Doc | null>(comp.docs[0] ?? null);
  const [tab, setTab]             = useState<"doc" | "chat">("doc");
  const isTeam    = comp.participationType === "TEAM";
  const themeColor = comp.theme?.color ?? "#085782";

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 flex flex-col w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 shadow-2xl overflow-hidden"
        style={{ animation: "slideInRight 0.22s ease-out" }}>

        {/* Header */}
        <div className="flex items-start gap-3 px-4 py-3 border-b border-zinc-800"
          style={{ borderLeftColor: themeColor, borderLeftWidth: 4 }}>
          <button type="button" onClick={onClose}
            className="mt-0.5 shrink-0 rounded-lg p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-mono text-zinc-500">{comp.code}</p>
            <h2 className="text-sm font-bold text-white leading-snug">{comp.name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {comp.theme && (
                <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: themeColor }} />
                  {comp.theme.name}
                </span>
              )}
              <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                isTeam ? "bg-blue-950/60 text-blue-300" : "bg-emerald-950/60 text-emerald-300"
              }`}>
                {isTeam ? <Users className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
                {isTeam ? "Berpasukan" : "Individu"}
              </span>
              {comp.enrolled && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-green-950/60 text-green-300 px-1.5 py-0.5 rounded-full font-medium">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Disertai
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-zinc-800">
          <button type="button" onClick={() => setTab("doc")}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              tab === "doc" ? "text-white border-b-2 border-[#085782]" : "text-zinc-500 hover:text-zinc-300"
            }`}>
            <FileText className="h-3.5 w-3.5 inline mr-1.5" />
            Dokumen
          </button>
          <button type="button" onClick={() => setTab("chat")}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              tab === "chat" ? "text-white border-b-2 border-[#085782]" : "text-zinc-500 hover:text-zinc-300"
            }`}>
            🐯 AI Rimau
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">

          {tab === "doc" && (
            <div className="flex flex-col flex-1 min-h-0">
              {comp.docs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-zinc-500 p-8">
                  <FileText className="h-10 w-10 opacity-30" />
                  <p className="text-sm">Tiada dokumen dimuatkan untuk pertandingan ini.</p>
                  <p className="text-xs text-zinc-600">Tanya AI Rimau untuk maklumat lanjut.</p>
                  <button type="button" onClick={() => setTab("chat")}
                    className="mt-1 text-xs text-sky-400 hover:underline">Buka AI Rimau →</button>
                </div>
              ) : (
                <>
                  {/* Doc selector if multiple */}
                  {comp.docs.length > 1 && (
                    <div className="flex gap-1.5 px-3 py-2 border-b border-zinc-800 overflow-x-auto">
                      {comp.docs.map(d => (
                        <button key={d.id} type="button" onClick={() => setActiveDoc(d)}
                          className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] transition-colors ${
                            activeDoc?.id === d.id
                              ? "bg-[#085782] text-white"
                              : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                          }`}>
                          {d.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* PDF iframe */}
                  {activeDoc && (
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800">
                        <span className="text-[11px] text-zinc-400 truncate max-w-xs">{activeDoc.name}</span>
                        <a href={activeDoc.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 shrink-0 ml-2">
                          <ExternalLink className="h-3 w-3" /> Buka
                        </a>
                      </div>
                      <iframe
                        src={activeDoc.url}
                        title={activeDoc.name}
                        className="flex-1 w-full border-0 bg-zinc-900"
                        style={{ minHeight: 0 }}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Description + quick-open chat */}
              {comp.description && (
                <div className="border-t border-zinc-800 px-4 py-3 bg-zinc-900/50">
                  <p className="text-xs text-zinc-400 line-clamp-3">{comp.description}</p>
                </div>
              )}
            </div>
          )}

          {tab === "chat" && <MiniChat comp={comp} />}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0.7; }
          to   { transform: translateX(0);   opacity: 1;   }
        }
      `}</style>
    </div>
  );
}

// ── Competition card (vertical tile for grid layout) ──────────────────────────

function CompCard({ comp, onClick }: { comp: Competition; onClick: () => void }) {
  const themeColor = comp.theme?.color ?? "#085782";
  const isTeam     = comp.participationType === "TEAM";
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col hover:border-sky-400/50 dark:hover:border-sky-500/40 hover:shadow-lg hover:-translate-y-0.5 transition-all group"
    >
      {/* Top colour bar */}
      <div className="h-1.5 w-full group-hover:h-2 transition-all" style={{ backgroundColor: themeColor }} />

      <div className="flex-1 flex flex-col p-3 gap-2">
        {/* Code + type badge */}
        <div className="flex items-start justify-between gap-1.5">
          <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500 font-semibold">{comp.code}</span>
          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${
            isTeam ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                   : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          }`}>
            {isTeam ? <Users className="h-2 w-2" /> : <User className="h-2 w-2" />}
            {isTeam ? "Pasukan" : "Individu"}
          </span>
        </div>

        {/* Name */}
        <h3 className="text-xs font-bold dark:text-zinc-100 leading-snug line-clamp-3 flex-1">
          {comp.name}
        </h3>

        {/* Footer: enrolled + doc count */}
        <div className="flex items-center gap-1.5 flex-wrap mt-auto">
          {comp.enrolled && (
            <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300">
              <CheckCircle2 className="h-2.5 w-2.5" /> Disertai
            </span>
          )}
          {comp.docs.length > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
              <FileText className="h-2.5 w-2.5" /> {comp.docs.length} dok
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function CompetitionsClient({ competitions }: { competitions: Competition[] }) {
  const [selected, setSelected] = useState<Competition | null>(null);
  const handleClose = useCallback(() => setSelected(null), []);

  // Group by theme, sort each group by code
  const groups = (() => {
    const map = new Map<string, { color: string | null; comps: Competition[] }>();
    for (const c of competitions) {
      const key = c.theme?.name ?? "Umum";
      if (!map.has(key)) map.set(key, { color: c.theme?.color ?? null, comps: [] });
      map.get(key)!.comps.push(c);
    }
    for (const v of map.values()) v.comps.sort((a, b) => a.code.localeCompare(b.code));
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  if (competitions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 py-16 px-6 text-center">
        <div className="rounded-full bg-zinc-100 dark:bg-zinc-800 p-4">
          <Users className="h-8 w-8 text-zinc-400 dark:text-zinc-500" strokeWidth={1.5} />
        </div>
        <div>
          <p className="font-medium dark:text-zinc-200">Tiada pertandingan</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Tiada pertandingan yang sepadan dengan profil anda buat masa ini.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {groups.map(group => (
          <div key={group.name} className="space-y-2">
            {/* Theme header */}
            <div className="flex items-center gap-2.5">
              {group.color && (
                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
              )}
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                {group.name}
              </h2>
              <span className="text-xs text-zinc-400 dark:text-zinc-600">({group.comps.length})</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {group.comps.map(comp => (
                <CompCard key={comp.id} comp={comp} onClick={() => setSelected(comp)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {selected && <CompetitionSheet comp={selected} onClose={handleClose} />}
    </>
  );
}
