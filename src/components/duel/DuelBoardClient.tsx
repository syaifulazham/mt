"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock, Maximize, Minimize } from "lucide-react";
import { AvatarPreference, TeamAvatar, preferFor } from "@/components/duel/TeamAvatar";
import { WhepVideo } from "@/components/duel/WhepVideo";
import { cn } from "@/lib/utils";

// Public big-screen duel board: "Jadual" (sessions + standings) or "Duel
// semasa" (each arena's running session with a countdown). Polls every 3 s;
// the clock ticks locally between polls. A passcode, when the link has one, is
// asked once and kept on this device.

const REFRESH_MS = 3_000;
const ROTATE_MS = 15_000;
/** Sessions per screen (2 × 2); more pages rotate on the slide timer. */
const PAGE = 4;

const FONT_CSS = `@import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@400;700;900&family=Rajdhani:wght@500;600;700&display=swap');
.db-exo{font-family:'Exo 2',sans-serif}
@keyframes dbPulse{0%,100%{opacity:1}50%{opacity:.35}}`;

type PubTeam = { name: string; contingent: string; state: string | null; flagUrl: string | null; logoUrl: string | null };
type SchedTeam = PubTeam & { rank: number | null; points: number | null; advanced: boolean };
type SchedSession = { id: string; label: string; arena: number; scheduledAt: string | null; status: string; teams: SchedTeam[] };
type LiveSession = { id: string; label: string; group: string | null; round: string; status: string; scheduledAt: string | null; remainingMs: number; video?: string | null; teams: PubTeam[] };
type Bracket = {
  key: string; name: string | null; flagUrl: string | null;
  rounds: { number: number; isFinal: boolean; status: string; title?: string; sessions: SchedSession[] }[];
  finished: boolean;
  standings: (PubTeam & { position: number; total: number })[];
};
type Comp = {
  id: string; code: string; name: string; scope: "NATIONAL" | "STATE"; durationSec: number; advance: number;
  /** SCHEDULE: one bracket, or one per state. */
  groups?: Bracket[];
  arenas?: { arena: number; live: LiveSession | null; next: LiveSession | null }[];
};
type Data = { kind: "SCHEDULE" | "LIVE"; label: string | null; event: { name: string }; competitions: Comp[]; serverNow: number };
type Status = "loading" | "ready" | "passcode" | "closed" | "notfound" | "error";

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};

const clock = (ms: number) => { const t = Math.ceil(Math.max(0, ms) / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
const hhmm = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" }) : null;
const roundName = (r: { number: number; isFinal: boolean; title?: string }) => r.title ?? (r.isFinal ? "Akhir" : `Pusingan ${r.number}`);

const BG = {
  background: "radial-gradient(ellipse at 20% 0%, #6d28d9 0%, transparent 55%), radial-gradient(ellipse at 100% 100%, #0e7490 0%, transparent 45%), linear-gradient(135deg, #2e1065 0%, #4c1d95 45%, #3b0764 100%)",
  fontFamily: "'Rajdhani', sans-serif",
};

function Chevrons({ flip }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 60 40" className={cn("h-[4.5vh] w-auto text-cyan-300", flip && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="4">
      <path d="M4 4l16 16L4 36M24 4l16 16-16 16M44 4l12 16-12 16" opacity=".85" />
    </svg>
  );
}

export function DuelBoardClient({ slug }: { slug: string }) {
  const pcKey = `duel_pc_${slug}`;
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<Data | null>(null);
  const [offset, setOffset] = useState(0);
  const [passcode, setPasscode] = useState("");
  const [pcError, setPcError] = useState("");
  const [checking, setChecking] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [idle, setIdle] = useState(false);
  const [run, setRun] = useState(0);
  const [now, setNow] = useState(0);
  const [slide, setSlide] = useState(0);

  const load = useCallback(async (code: string | null): Promise<Status> => {
    try {
      const res = await fetch(`/api/duel/${slug}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: code ?? "" }), cache: "no-store",
      });
      if (res.status === 404) return "notfound";
      if (res.status === 403) return "closed";
      if (res.status === 401) return "passcode";
      if (!res.ok) return "error";
      const j = (await res.json()) as Data;
      setOffset(j.serverNow - Date.now());
      setData(j);
      return "ready";
    } catch { return "error"; }
  }, [slug]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const st = await load(store.get(pcKey));
      if (!alive) return;
      if (st === "passcode") store.del(pcKey);
      setStatus(cur => (st === "error" && cur === "ready" ? cur : st));
      if (st === "ready" || st === "error" || st === "closed") timer = setTimeout(tick, REFRESH_MS);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [load, pcKey, run]);

  // Local clock (server time) for the countdown, and the slide rotation.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(t);
  }, [offset]);
  useEffect(() => {
    const t = setInterval(() => setSlide(s => s + 1), ROTATE_MS);
    const onFs = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => { clearInterval(t); document.removeEventListener("fullscreenchange", onFs); };
  }, []);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => { setIdle(false); clearTimeout(t); t = setTimeout(() => setIdle(true), 3000); };
    wake();
    window.addEventListener("mousemove", wake);
    return () => { clearTimeout(t); window.removeEventListener("mousemove", wake); };
  }, []);

  async function submitPasscode(e: React.FormEvent) {
    e.preventDefault();
    const code = passcode.trim().toUpperCase();
    if (code.length < 6) return;
    setChecking(true); setPcError("");
    const st = await load(code);
    setChecking(false);
    if (st === "passcode") { setPcError("Passcode tidak sah."); return; }
    if (st === "ready") { store.set(pcKey, code); setRun(r => r + 1); }
    setStatus(st);
  }

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  if (status !== "ready" || !data) {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center p-4 text-white" style={BG}>
        <style>{FONT_CSS}</style>
        {status === "loading" && <Loader2 className="h-10 w-10 animate-spin text-white/40" />}
        {status === "passcode" && (
          <form onSubmit={submitPasscode} className="w-full max-w-sm space-y-5 rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur">
            <img src="/logos-white/mt-logo-white.svg" alt="Techlympics" className="mx-auto h-16 w-auto" />
            <p className="db-exo flex items-center justify-center gap-2 text-lg font-bold uppercase tracking-wide"><Lock className="h-4 w-4" /> Paparan Duel</p>
            <input value={passcode} autoFocus maxLength={32} autoCapitalize="characters"
              onChange={e => setPasscode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.3em] outline-none focus:border-cyan-300" />
            {pcError && <p className="text-sm text-red-300">{pcError}</p>}
            <button disabled={checking || passcode.length < 6}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 py-3 font-bold text-violet-950 disabled:opacity-40">
              {checking && <Loader2 className="h-4 w-4 animate-spin" />} Papar
            </button>
          </form>
        )}
        {(status === "closed" || status === "notfound" || status === "error") && (
          <div className="space-y-3 text-center">
            <img src="/logos-white/mt-logo-white.svg" alt="Techlympics" className="mx-auto h-20 w-auto opacity-70" />
            <p className="text-xl font-semibold">
              {status === "closed" ? "Paparan ini telah ditutup." : status === "notfound" ? "Pautan tidak dijumpai." : "Tidak dapat memuatkan paparan."}
            </p>
          </div>
        )}
      </main>
    );
  }

  const isLive = data.kind === "LIVE";
  const comps = data.competitions;
  // Schedule: one bracket (competition, or competition × state) per slide, its sessions paged by PAGE.
  const slides = isLive ? [] : comps.flatMap(c => {
    const brackets: (Bracket | null)[] = c.groups?.length ? c.groups : [null];
    return brackets.flatMap(g => {
      const r = g?.rounds[g.rounds.length - 1];
      const pages = Math.max(1, Math.ceil((r?.sessions.length ?? 0) / PAGE));
      return Array.from({ length: pages }, (_, p) => ({ c, g, p, pages }));
    });
  });
  const cur = slides.length ? slides[slide % slides.length] : null;
  const curRound = cur?.g?.rounds[cur.g.rounds.length - 1];

  return (
    <main className={cn("flex h-dvh w-full flex-col overflow-hidden text-white", idle && "cursor-none")} style={BG}>
      <style>{FONT_CSS}</style>
      <header className="flex shrink-0 items-center gap-[2vw] px-[3vw] pb-[1.5vh] pt-[2.5vh]">
        <img src="/logos-white/mt-logo-white.svg" alt="Techlympics" className="w-auto" style={{ height: "min(8vh, 12vw)" }} />
        <Chevrons />
        <div className="min-w-0 flex-1 text-center">
          <p className="db-exo font-black uppercase leading-none tracking-wide" style={{ fontSize: "min(5.2vh, 4vw)" }}>
            {isLive ? "Duel Semasa" : cur ? cur.c.name : "Jadual Duel"}
          </p>
          <p className="db-exo mt-[0.8vh] truncate font-bold uppercase tracking-[0.25em] text-cyan-300" style={{ fontSize: "min(3vh, 2.4vw)" }}>
            {isLive ? data.event.name
              : curRound ? `${cur?.g?.name ? `${cur.g.name} · ` : ""}${roundName(curRound)}${cur && cur.pages > 1 ? ` · ${cur.p + 1}/${cur.pages}` : ""}`
              : data.event.name}
          </p>
        </div>
        <Chevrons flip />
        <p className="db-exo shrink-0 whitespace-nowrap text-right font-bold tabular-nums" style={{ fontSize: "min(4vh, 3vw)" }}>
          {now ? new Date(now).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" }) : ""}
        </p>
      </header>

      <div className="min-h-0 flex-1 px-[3vw] pb-[2vh]">
        {comps.length === 0 ? (
          <Empty text="Tiada pertandingan duel untuk dipaparkan." />
        ) : isLive ? (
          <LiveView comps={comps} now={now} serverNow={data.serverNow} />
        ) : cur ? (
          <AvatarPreference value={preferFor(cur.c.scope)}>
            <ScheduleView comp={cur.c} bracket={cur.g} page={cur.p} />
          </AvatarPreference>
        ) : null}
      </div>

      <footer className="flex shrink-0 items-center justify-between px-[3vw] pb-[1.5vh] text-white/40" style={{ fontSize: "min(1.8vh, 1.4vw)" }}>
        <span className="uppercase tracking-widest">{data.event.name}{data.label ? ` · ${data.label}` : ""}</span>
        {!isLive && slides.length > 1 && (
          <span className="flex gap-1.5">
            {slides.map((_, i) => <span key={i} className={cn("h-1.5 w-6 rounded-full", i === slide % slides.length ? "bg-cyan-300" : "bg-white/20")} />)}
          </span>
        )}
      </footer>

      <button onClick={toggleFull} className={cn("fixed bottom-4 right-4 rounded-full bg-white/10 p-3 transition-opacity hover:bg-white/20", idle && "pointer-events-none opacity-0")}>
        {isFull ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
      </button>
    </main>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-[3vh] font-semibold text-white/60">{text}</div>;
}

// ── Schedule: session cards (left) + standings table (right) ─────────────────

function ScheduleView({ comp, bracket, page }: { comp: Comp; bracket: Bracket | null; page: number }) {
  const round = bracket?.rounds[bracket.rounds.length - 1];
  if (!bracket || !round) return <Empty text={`${comp.code} ${comp.name} — cabutan belum disahkan.`} />;
  const sessions = round.sessions.slice(page * PAGE, page * PAGE + PAGE);
  // 1 session fills the area; 2 side by side; 3–4 in a 2 × 2 grid sharing the height.
  const cols = sessions.length <= 1 ? 1 : 2;
  const gridRows = sessions.length <= 2 ? 1 : 2;
  const standings = bracket.standings.slice(0, 10);

  return (
    <div className="grid h-full gap-[2vw]" style={{ gridTemplateColumns: standings.length ? "minmax(0,2.1fr) minmax(0,1fr)" : "1fr" }}>
      <div className="grid h-full min-h-0 gap-x-[2vw] gap-y-[4.5vh] pt-[3vh]"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${gridRows}, minmax(0,1fr))` }}>
        {sessions.map(s => <SessionCard key={s.id} s={s} isFinal={round.isFinal} advance={comp.advance} rows={Math.max(...sessions.map(x => x.teams.length))} />)}
      </div>
      {standings.length > 0 && (
        <div className="flex min-h-0 flex-col pt-[2vh]">
          <span className="db-exo self-start rounded-full bg-gradient-to-r from-cyan-400 to-teal-300 px-[1.2vw] py-[0.5vh] font-black uppercase text-violet-950" style={{ fontSize: "min(2.4vh, 1.8vw)" }}>
            {bracket.finished ? "Kedudukan Akhir" : "Kedudukan Semasa"}{bracket.name ? ` · ${bracket.name}` : ""}
          </span>
          <div className="mt-[1.5vh] grid gap-[0.8vh]" style={{ gridTemplateColumns: "auto minmax(0,1fr) auto" }}>
            {["#", "Pasukan", "Mata"].map(h => (
              <span key={h} className="db-exo bg-[#0f0a2e] px-[0.8vw] py-[0.8vh] text-center font-bold uppercase" style={{ fontSize: "min(1.9vh, 1.4vw)" }}>{h}</span>
            ))}
            {standings.map(t => (
              <Row3 key={`${t.position}-${t.name}`} pos={t.position} team={t} pts={t.total} gold={bracket.finished && t.position <= 3} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row3({ pos, team, pts, gold }: { pos: number; team: PubTeam; pts: number; gold?: boolean }) {
  const fs = { fontSize: "min(2.2vh, 1.6vw)" };
  return (
    <>
      <span className={cn("flex items-center justify-center gap-1 px-[0.8vw] font-bold", gold ? "bg-amber-400/90 text-violet-950" : "bg-white/10")} style={fs}>
        <span className="text-cyan-300">»</span>{pos}
      </span>
      <span className="flex min-w-0 items-center justify-between gap-2 bg-white/10 px-[0.8vw] py-[0.6vh]" style={fs}>
        <span className="truncate font-semibold uppercase">{team.name}</span>
        <TeamAvatar flagUrl={team.flagUrl} logoUrl={team.logoUrl} name={team.contingent} className="h-[3.2vh] w-[3.2vh]" />
      </span>
      <span className="db-exo flex items-center justify-center bg-white/10 px-[0.8vw] font-bold tabular-nums" style={fs}>{pts}</span>
    </>
  );
}

function SessionCard({ s, isFinal, advance, rows }: { s: SchedSession; isFinal: boolean; advance: number; rows: number }) {
  // Rows share the card's height, capped so a short session does not stretch.
  const rowMax = rows > 4 ? "5vh" : "6.5vh";
  const st = s.status === "RUNNING" || s.status === "PAUSED" ? "LANGSUNG" : s.status === "DONE" ? "SELESAI" : s.status === "ENDED" ? "MENUNGGU KEPUTUSAN" : null;
  return (
    <div className="relative flex min-h-0 flex-col rounded-[2vh] bg-white/10 pb-[1.4vh] pl-[3.2vw] pr-[1vw] pt-[1.6vh] shadow-xl backdrop-blur-sm">
      <span className="db-exo absolute -left-[0.8vw] -top-[2.2vh] flex h-[8vh] w-[8vh] flex-col items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 text-center font-black leading-none text-violet-950 shadow-lg">
        <span style={{ fontSize: "min(1.5vh, 1.1vw)" }}>{isFinal ? "" : s.label.startsWith("Perlawanan ") ? "Perl." : "Sesi"}</span>
        <span style={{ fontSize: isFinal ? "min(2.2vh, 1.6vw)" : "min(3.6vh, 2.6vw)" }}>{isFinal ? "AKHIR" : s.label.replace(/^(Sesi|Perlawanan) /, "")}</span>
      </span>
      <div className="mb-[0.6vh] flex items-center justify-end gap-2 text-white/60" style={{ fontSize: "min(1.7vh, 1.2vw)" }}>
        {s.arena > 0 && <span className="uppercase tracking-wider">Arena {s.arena}</span>}
        {hhmm(s.scheduledAt) && <span>· {hhmm(s.scheduledAt)}</span>}
        {s.arena === 0 && <span className="uppercase tracking-wider">Bye</span>}
        {st && (
          <span className={cn("rounded-full px-2 font-bold", st === "LANGSUNG" ? "bg-red-500 text-white" : "bg-white/15 text-white")}
            style={st === "LANGSUNG" ? { animation: "dbPulse 1.4s infinite" } : undefined}>{st}</span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[0.7vh]">
        {s.teams.map((t, i) => (
          <div key={i} className="flex min-h-0 flex-1 items-center gap-[0.8vw]" style={{ maxHeight: rowMax }}>
            <TeamAvatar flagUrl={t.flagUrl} logoUrl={t.logoUrl} name={t.contingent} className="aspect-square h-[min(4.2vh,100%)] w-auto" />
            <span className="min-w-0 flex-1 truncate font-bold" style={{ fontSize: "min(2.8vh, 2vw)" }}>
              {t.name}
              <span className="ml-2 font-medium text-white/50" style={{ fontSize: "min(1.8vh, 1.3vw)" }}>{t.contingent}</span>
            </span>
            <span className={cn("db-exo flex h-full min-w-[5vw] items-center justify-center rounded-r-full px-[1vw] font-black tabular-nums",
              t.points == null ? "bg-white/5 text-white/30" : t.advanced || (isFinal && t.rank === 1) ? "bg-gradient-to-r from-transparent to-cyan-500/80" : "bg-gradient-to-r from-transparent to-white/20")}
              style={{ fontSize: "min(2.8vh, 2vw)" }}>
              {t.points ?? "–"}
            </span>
          </div>
        ))}
      </div>
      {!isFinal && s.status === "DONE" && (
        <p className="mt-[0.6vh] text-right text-cyan-200/80" style={{ fontSize: "min(1.5vh, 1.1vw)" }}>Kedudukan 1–{advance} mara</p>
      )}
    </div>
  );
}

// ── Live: running duels only, contenders around the countdown ────────────────

/** Grid columns for n cards, so they fill the screen without scrolling. */
const liveCols = (n: number) => (n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4);

/**
 * Where contender i of n sits around the clock, as % of the arena area.
 * 2 face each other left/right; more sit on an ellipse — even counts start
 * half a step off the top so no one is directly above the clock.
 */
function seat(i: number, n: number) {
  if (n === 1) return { x: 50, y: 80 };
  const start = n === 2 ? 180 : -90 + (n % 2 === 0 ? 180 / n : 0);
  const a = ((start + (i * 360) / n) * Math.PI) / 180;
  const rx = n === 2 ? 33 : 35, ry = n === 2 ? 0 : 33;
  return { x: 50 + rx * Math.cos(a), y: 50 + ry * Math.sin(a) };
}

function LiveView({ comps, now, serverNow }: { comps: Comp[]; now: number; serverNow: number }) {
  const cards = comps.flatMap(c => (c.arenas ?? [])
    .filter(a => a.live && (a.live.status === "RUNNING" || a.live.status === "PAUSED"))
    .map(a => ({ c, a, s: a.live! })));
  if (cards.length === 0) {
    const next = comps.flatMap(c => (c.arenas ?? []).filter(a => a.next).map(a => ({ c, a })));
    return (
      <div className="flex h-full flex-col items-center justify-center gap-[3vh] text-white/70">
        <p className="db-exo font-black uppercase tracking-widest" style={{ fontSize: "min(5vh, 3.5vw)" }}>Tiada duel berjalan sekarang</p>
        {next.length > 0 && (
          <div className="flex max-w-[80vw] flex-wrap justify-center gap-[1vw]" style={{ fontSize: "min(2.2vh, 1.6vw)" }}>
            {next.slice(0, 8).map(({ c, a }) => (
              <span key={`${c.id}-${a.arena}`} className="rounded-full bg-white/10 px-[1vw] py-[0.6vh]">
                Arena {a.arena} · <b className="text-white">{a.next!.label}{a.next!.group ? ` · ${a.next!.group}` : ""}</b>
                {hhmm(a.next!.scheduledAt) ? ` · ${hhmm(a.next!.scheduledAt)}` : ""}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }
  const cols = liveCols(cards.length);
  const rows = Math.ceil(cards.length / cols);
  const elapsed = now ? Math.max(0, now - serverNow) : 0;

  return (
    <div className="grid h-full gap-[1.5vw] pt-[1vh]"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0,1fr))` }}>
      {cards.map(({ c, a, s }) => {
        const ms = s.status === "RUNNING" ? s.remainingMs - elapsed : s.remainingMs;
        const n = s.teams.length;
        const urgent = s.status === "RUNNING" && ms <= 10_000;
        return (
          <AvatarPreference key={`${c.id}-${a.arena}`} value={preferFor(c.scope)}>
            <div className="flex min-h-0 flex-col overflow-hidden rounded-[2.5vh] border border-white/10 bg-white/10 shadow-2xl backdrop-blur-sm"
              style={{ containerType: "size" }}>
              {/* Header: arena, session · state, round, status */}
              <div className="flex shrink-0 items-center gap-[2cqw] bg-[#0f0a2e]/70 px-[3cqw] py-[1.6cqh]">
                <span className="db-exo font-black uppercase tracking-widest text-cyan-300" style={{ fontSize: "max(12px, 4.2cqmin)" }}>Arena {a.arena}</span>
                <span className="db-exo rounded-full bg-gradient-to-r from-cyan-400 to-teal-300 px-[2cqw] font-black uppercase text-violet-950" style={{ fontSize: "max(11px, 3.6cqmin)" }}>
                  {s.label}{s.group ? ` · ${s.group}` : ""}
                </span>
                <span className="min-w-0 flex-1 truncate text-right text-white/70" style={{ fontSize: "max(10px, 3cqmin)" }}>{c.code} {c.name} · {s.round}</span>
                <span className={cn("shrink-0 rounded-full px-[1.6cqw] font-bold", s.status === "PAUSED" ? "bg-amber-400 text-violet-950" : "bg-red-500")}
                  style={{ fontSize: "max(10px, 3cqmin)", animation: s.status === "RUNNING" ? "dbPulse 1.4s infinite" : undefined }}>
                  {s.status === "PAUSED" ? "JEDA" : ms <= 0 ? "MASA TAMAT" : "LANGSUNG"}
                </span>
              </div>

              {s.video ? (
                /* Live video from the media team: video, with the clock and contenders beside it */
                <div className="flex min-h-0 flex-1">
                  <WhepVideo url={s.video} className="min-w-0 flex-[1.8]" />
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-[3cqh] px-[5cqw] py-[3cqh]" style={{ containerType: "size" }}>
                    <p className={cn("db-exo text-center font-black leading-none tabular-nums", urgent ? "text-red-400" : s.status === "PAUSED" ? "text-amber-300" : "text-white")}
                      style={{ fontSize: "min(26cqw, 18cqh)", animation: urgent ? "dbPulse 1s infinite" : undefined, textShadow: "0 0 4cqmin rgba(34,211,238,.45)" }}>
                      {clock(ms)}
                    </p>
                    <div className="space-y-[2cqh]">
                      {s.teams.map((t, i) => (
                        <div key={i} className="flex items-center gap-[4cqw]">
                          <TeamAvatar flagUrl={t.flagUrl} logoUrl={t.logoUrl} name={t.contingent} className="h-[min(16cqw,9cqh)] w-[min(16cqw,9cqh)] shadow ring-2 ring-cyan-300/60" />
                          <span className="min-w-0">
                            <span className="block truncate font-bold leading-tight" style={{ fontSize: "min(8cqw, 4.6cqh)" }}>{t.name}</span>
                            <span className="block truncate text-white/60" style={{ fontSize: "min(5.5cqw, 3.2cqh)" }}>{t.contingent}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
              /* Arena: clock in the middle, contenders around it */
              <div className="relative min-h-0 flex-1" style={{ containerType: "size" }}>
                {n > 2 && (
                  <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-cyan-300/25"
                    style={{ width: "70cqw", height: "66cqh" }} />
                )}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                  <p className={cn("db-exo font-black leading-none tabular-nums", urgent ? "text-red-400" : s.status === "PAUSED" ? "text-amber-300" : "text-white")}
                    style={{ fontSize: n > 4 ? "15cqmin" : n > 2 ? "18cqmin" : "24cqmin", animation: urgent ? "dbPulse 1s infinite" : undefined, textShadow: "0 0 4cqmin rgba(34,211,238,.45)" }}>
                    {clock(ms)}
                  </p>
                  {n === 2 && <p className="db-exo mt-[1cqh] font-black text-cyan-300" style={{ fontSize: "7cqmin" }}>VS</p>}
                </div>
                {s.teams.map((t, i) => {
                  const p = seat(i, n);
                  const w = n === 2 ? 30 : n > 4 ? 24 : 28;
                  return (
                    <div key={i} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center"
                      style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${w}cqw` }}>
                      <TeamAvatar flagUrl={t.flagUrl} logoUrl={t.logoUrl} name={t.contingent}
                        className={cn("shadow-lg ring-2 ring-cyan-300/60", n > 4 ? "h-[13cqmin] w-[13cqmin]" : "h-[17cqmin] w-[17cqmin]")} />
                      <span className="sr-only">{t.name}</span>
                      <span className="mt-[1cqh] line-clamp-2 w-full font-bold leading-tight" style={{ fontSize: n > 4 ? "3.6cqmin" : "4.4cqmin" }}>{t.name}</span>
                      <span className="line-clamp-1 w-full text-white/60" style={{ fontSize: n > 4 ? "2.6cqmin" : "3cqmin" }}>{t.contingent}</span>
                    </div>
                  );
                })}
              </div>
              )}

              {a.next && (
                <div className="shrink-0 truncate border-t border-white/10 bg-black/20 px-[3cqw] py-[1cqh] text-white/60" style={{ fontSize: "max(10px, 2.8cqmin)" }}>
                  Seterusnya di arena ini: <b className="text-white">{a.next.label}{a.next.group ? ` · ${a.next.group}` : ""}</b>
                  {hhmm(a.next.scheduledAt) ? ` · ${hhmm(a.next.scheduledAt)}` : ""}
                </div>
              )}
            </div>
          </AvatarPreference>
        );
      })}
    </div>
  );
}
