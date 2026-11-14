"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { SkyFx } from "./SkyFx";
import { Activity, Clock, Gauge, Loader2, Lock, Maximize, Minimize, TimerReset, UserRound, Zap, type LucideIcon } from "lucide-react";

// Public big-screen live scoreboard of a VibeBlocks walk-in competition.
// Polls every 5 s (the server caches VibeBlocks for 5 s); a passcode, when the
// link has one, is asked once and kept on this device. A failed poll keeps
// the last good board on screen.

const REFRESH_MS = 5_000;
/** Fallbacks when the link has no paging set (names per screen, seconds per page). */
const DEFAULT_PAGE_SIZE = 12;
const DEFAULT_PAGE_SECONDS = 10;
const FONT_CSS = `@import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@500;700;800&family=Rajdhani:wght@500;600;700&family=Orbitron:wght@800;900&display=swap');
.lb-exo{font-family:'Exo 2',sans-serif}
.lb-title{font-family:'Orbitron','Exo 2',sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:.045em;
  color:#fff;-webkit-text-stroke:.1em #1e3a8a;paint-order:stroke fill;
  text-shadow:0 0 .35em rgba(96,165,250,.75),0 0 1.1em rgba(56,189,248,.35),0 .1em .2em rgba(2,6,23,.6)}
.lb-title .lb-code{color:#7dd3fc}`;

type Row = {
  key: string;
  rank: number | null; name: string; contingent: string | null;
  status: "ready" | "in_progress" | "completed" | "timed_out";
  completedStages: number; totalStages: number; progress: number;
  collisions: number | null; elapsedMs: number | null; penaltyMs: number | null; totalMs: number | null;
};
type Data = {
  label: string | null;
  /** Names on one screen at most, and seconds per page (walk-in configuration). */
  pageSize?: number;
  pageSeconds?: number;
  /** Table header as text labels or icons only. */
  headerStyle?: "LABEL" | "ICON";
  competition: { code: string; name: string };
  eventName: string;
  status: "LIVE" | "UPCOMING" | "ENDED" | "CLOSED" | "UNKNOWN";
  rows: Row[];
  updatedAt: string;
};
type Status = "loading" | "ready" | "passcode" | "closed" | "notfound" | "unavailable" | "error";

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};

/** Bar colour: finished green, well along sky → blue, early amber, timed out grey. */
function barFill(r: Row): string {
  if (r.status === "timed_out") return "linear-gradient(90deg,#94a3b8,#64748b)";
  if (r.progress >= 100) return "linear-gradient(90deg,#34d399,#059669)";
  if (r.progress >= 50) return "linear-gradient(90deg,#38bdf8,#2563eb)";
  if (r.progress > 0) return "linear-gradient(90deg,#fcd34d,#f59e0b)";
  return "transparent";
}

/**
 * Donut beside the total time: how much of it is real time taken and how
 * much is collision penalty. Segments are stroke-dasharray arcs on a
 * circumference of 100, drawn in by anime.js.
 */
function TimeDonut({ r }: { r: Row }) {
  const total = r.totalMs ?? 0;
  const pen = r.elapsedMs == null ? 0 : Math.min(r.penaltyMs ?? 0, total);
  const timePct = total > 0 ? ((total - pen) / total) * 100 : 0;
  const penPct = total > 0 ? (pen / total) * 100 : 0;
  const done = r.progress >= 100;
  const R = 15.9155; // 2πR = 100
  return (
    <svg viewBox="0 0 40 40" className="h-[1.35em] w-[1.35em] shrink-0 -rotate-90" aria-hidden>
      <circle cx="20" cy="20" r={R} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="6" />
      {total > 0 && (
        <>
          <circle data-donut data-len={timePct} data-off={0} cx="20" cy="20" r={R} fill="none"
            stroke={done ? "#34d399" : "#fbbf24"} strokeWidth="6" strokeDasharray="0 100" strokeDashoffset="0" />
          {penPct > 0 && (
            <circle data-donut data-len={penPct} data-off={-timePct} cx="20" cy="20" r={R} fill="none"
              stroke="#fb7185" strokeWidth="6" strokeDasharray="0 100" strokeDashoffset={-timePct} />
          )}
        </>
      )}
    </svg>
  );
}

/** What a viewer would notice changing on a row (flashes it). */
const sig = (r: Row) => `${r.progress}|${r.collisions}|${r.totalMs}|${r.penaltyMs}|${r.rank}`;

/** Table columns: label, and the icon used when the header is set to icons. */
const COLUMNS: { label: React.ReactNode; title: string; icon: LucideIcon }[] = [
  { label: "Participant", title: "Participant", icon: UserRound },
  { label: <>Progress<br />(completion)</>, title: "Progress (completion)", icon: Activity },
  { label: "Time taken", title: "Time taken", icon: Clock },
  { label: "Collisions", title: "Collisions", icon: Zap },
  { label: "Penalty time", title: "Penalty time", icon: TimerReset },
  { label: <>Total time<br />consumed</>, title: "Total time consumed", icon: Gauge },
];

/** m:ss, or h:mm:ss from an hour; "---" when there is no time yet. */
function fmt(ms: number | null): string {
  if (ms == null) return "---";
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

const STATUS_STYLE: Record<Data["status"], { label: string; color: string; pulse: boolean }> = {
  LIVE:     { label: "LIVE",       color: "#4ade80", pulse: true },
  UPCOMING: { label: "BELUM MULA", color: "#fcd34d", pulse: false },
  ENDED:    { label: "TAMAT",      color: "#cbd5e1", pulse: false },
  CLOSED:   { label: "DITUTUP",    color: "#cbd5e1", pulse: false },
  UNKNOWN:  { label: "—",          color: "#cbd5e1", pulse: false },
};

export function LiveScoreboardClient({ slug }: { slug: string }) {
  const pcKey = `live_pc_${slug}`;
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState("");
  const [passcode, setPasscode] = useState("");
  const [pcError, setPcError] = useState("");
  const [checking, setChecking] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [idle, setIdle] = useState(false);
  const [run, setRun] = useState(0);
  const [page, setPage] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  // Row positions and values from the previous render, for the FLIP move and the change flash.
  const prevTops = useRef<Map<string, number>>(new Map());
  const prevSig = useRef<Map<string, string>>(new Map());
  const shownPage = useRef<number | null>(null);
  const pageSize = data?.pageSize || DEFAULT_PAGE_SIZE;
  const pageMs = (data?.pageSeconds || DEFAULT_PAGE_SECONDS) * 1000;
  const pages = Math.max(1, Math.ceil((data?.rows.length ?? 0) / pageSize));
  useEffect(() => {
    if (pages <= 1) return;
    const t = setInterval(() => setPage((p) => p + 1), pageMs);
    return () => clearInterval(t);
  }, [pages, pageMs]);

  const load = useCallback(async (code: string | null): Promise<Status> => {
    try {
      const res = await fetch(`/api/live/${slug}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: code ?? "" }), cache: "no-store",
      });
      if (res.status === 404) return "notfound";
      if (res.status === 403) return "closed";
      if (res.status === 401) return "passcode";
      if (res.status === 409) { setMessage((await res.json().catch(() => null))?.message ?? ""); return "unavailable"; }
      if (!res.ok) return "error";
      setData((await res.json()) as Data);
      return "ready";
    } catch {
      return "error";
    }
  }, [slug]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const st = await load(store.get(pcKey));
      if (!alive) return;
      if (st === "passcode") store.del(pcKey);
      setStatus((cur) => (st === "error" && cur === "ready" ? cur : st));
      if (st !== "passcode" && st !== "notfound") timer = setTimeout(tick, REFRESH_MS);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [load, pcKey, run]);

  useEffect(() => {
    const onFs = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    let t: ReturnType<typeof setTimeout>;
    const wake = () => { setIdle(false); clearTimeout(t); t = setTimeout(() => setIdle(true), 3000); };
    wake();
    window.addEventListener("mousemove", wake);
    return () => { document.removeEventListener("fullscreenchange", onFs); clearTimeout(t); window.removeEventListener("mousemove", wake); };
  }, []);

  // anime.js: entrance, rank moves, progress bars and change flashes, after each render of the board.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || status !== "ready" || !data) return;
    const rowsEl = [...list.querySelectorAll<HTMLElement>("[data-row]")];
    const pageNow = page % Math.max(1, Math.ceil(data.rows.length / (data.pageSize || DEFAULT_PAGE_SIZE)));
    const fresh = shownPage.current !== pageNow;
    shownPage.current = pageNow;

    if (fresh) {
      // First paint or a new page: rows slide in one after another, bars fill from empty.
      animate(rowsEl, { opacity: [0, 1], translateX: ["-3vw", "0vw"], duration: 700, delay: stagger(70), ease: "outExpo" });
      list.querySelectorAll<HTMLElement>("[data-bar]").forEach((el) => { el.style.width = "0%"; });
    } else {
      // Same page refreshed: rows that changed rank glide from where they were.
      for (const el of rowsEl) {
        const before = prevTops.current.get(el.dataset.row!);
        const dy = before == null ? 0 : before - el.offsetTop;
        if (dy) animate(el, { translateY: [dy, 0], duration: 800, ease: "outQuint" });
        else if (before == null) animate(el, { opacity: [0, 1], scale: [0.96, 1], duration: 500, ease: "outBack" });
      }
      // ...and rows whose numbers moved flash.
      const flashing = rowsEl.filter((el) => {
        const old = prevSig.current.get(el.dataset.row!);
        return old != null && old !== el.dataset.sig;
      }).map((el) => el.querySelector<HTMLElement>("[data-flash]")).filter((x): x is HTMLElement => !!x);
      if (flashing.length) animate(flashing, { opacity: [0.75, 0], duration: 1600, ease: "outQuad" });
    }

    // Time / penalty donuts draw their arcs (from empty on a fresh page). The
    // arc length is tweened as a number and written to stroke-dasharray.
    list.querySelectorAll<SVGCircleElement>("[data-donut]").forEach((el, i) => {
      const to = Number(el.dataset.len);
      const from = fresh ? 0 : Number(el.dataset.drawn ?? 0);
      const v = { len: from };
      const paint = () => {
        el.setAttribute("stroke-dasharray", `${v.len} ${100 - v.len}`);
        el.dataset.drawn = String(v.len);
      };
      paint();
      animate(v, { len: to, duration: fresh ? 1300 : 900, delay: fresh ? 400 + i * 60 : 0, ease: "outExpo", onUpdate: paint, onComplete: paint });
    });

    // Progress bars ease to their value (from 0 on a fresh page).
    list.querySelectorAll<HTMLElement>("[data-bar]").forEach((el, i) => {
      animate(el, { width: `${el.dataset.pct}%`, duration: fresh ? 1200 : 900, delay: fresh ? 250 + i * 70 : 0, ease: "outExpo" });
    });

    prevTops.current = new Map(rowsEl.map((el) => [el.dataset.row!, el.offsetTop]));
    prevSig.current = new Map(rowsEl.map((el) => [el.dataset.row!, el.dataset.sig ?? ""]));
  }, [data, page, status]);

  async function submitPasscode(e: React.FormEvent) {
    e.preventDefault();
    const code = passcode.trim().toUpperCase();
    if (code.length < 4) return;
    setChecking(true); setPcError("");
    const st = await load(code);
    setChecking(false);
    if (st === "passcode") { setPcError("Passcode tidak sah."); return; }
    if (st === "ready") { store.set(pcKey, code); setRun((r) => r + 1); }
    setStatus(st);
  }

  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  const bg = {
    background: "radial-gradient(ellipse at 50% -15%, #1e3a8a 0%, #0b1a45 38%, #050b24 70%, #02040f 100%)",
    fontFamily: "'Rajdhani', sans-serif",
  };

  if (status !== "ready" || !data) {
    return (
      <main className="relative min-h-dvh w-full flex items-center justify-center overflow-hidden p-4 text-white" style={bg}>
        <style>{FONT_CSS}</style>
        <SkyFx />
        {status === "loading" && <Loader2 className="relative z-10 h-10 w-10 animate-spin text-white/50" />}
        {status === "passcode" && (
          <form onSubmit={submitPasscode} className="relative z-10 w-full max-w-sm space-y-5 rounded-2xl border border-white/15 bg-white/10 p-8 text-center shadow-xl backdrop-blur">
            <img src="/logos-white/mt-logo-white.svg" alt="Malaysia Techlympics" className="mx-auto h-20 w-auto" />
            <div>
              <p className="lb-exo flex items-center justify-center gap-2 text-lg font-bold uppercase tracking-wide"><Lock className="h-4 w-4" /> Papan Skor Langsung</p>
              <p className="mt-1 text-sm text-white/60">Masukkan passcode untuk memaparkan papan skor.</p>
            </div>
            <input value={passcode} autoFocus maxLength={32} autoCapitalize="characters"
              onChange={(e) => setPasscode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.4em] text-white outline-none focus:border-sky-400" />
            {pcError && <p className="text-sm text-red-600">{pcError}</p>}
            <button disabled={checking || passcode.length < 4}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 font-bold text-slate-950 disabled:opacity-40">
              {checking && <Loader2 className="h-4 w-4 animate-spin" />} Papar
            </button>
          </form>
        )}
        {(status === "closed" || status === "notfound" || status === "error" || status === "unavailable") && (
          <div className="relative z-10 space-y-3 text-center">
            <img src="/logos-white/mt-logo-white.svg" alt="Malaysia Techlympics" className="mx-auto h-24 w-auto opacity-80" />
            <p className="text-xl font-semibold">
              {status === "closed" ? "Paparan ini telah ditutup."
                : status === "notfound" ? "Pautan tidak dijumpai."
                : status === "unavailable" ? (message || "Papan skor belum tersedia.")
                : "Tidak dapat memuatkan papan skor."}
            </p>
            {(status === "error" || status === "unavailable") && <p className="text-sm text-white/50">Cuba lagi dalam 5 saat…</p>}
          </div>
        )}
      </main>
    );
  }

  const st = STATUS_STYLE[data.status];
  const cur = page % pages;
  const rows = data.rows.slice(cur * pageSize, (cur + 1) * pageSize);
  const n = Math.max(rows.length, pages > 1 ? pageSize : 1);
  // Every row fits on one screen; rows share what the header leaves.
  const rowH = `min(9vh, calc(58vh / ${n}))`;
  const font = `min(calc(${rowH} * 0.42), 3.2vw)`;
  const grid = "minmax(0,2.2fr) minmax(0,1.4fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.2fr) minmax(0,1.3fr)";

  return (
    <main className={`relative flex h-dvh w-full flex-col overflow-hidden text-white ${idle ? "cursor-none" : ""}`} style={bg}>
      <style>{`${FONT_CSS}\n@keyframes lbPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      <SkyFx />

      <header className="relative z-10 flex shrink-0 flex-col items-center px-[3vw] pt-[2vh]">
        <img src="/logos-white/mt-logo-white.svg" alt="Malaysia Techlympics" className="w-auto drop-shadow-[0_0_18px_rgba(96,165,250,0.45)]" style={{ height: "min(15vh, 22vw)" }} />
        <h1 className="lb-title mt-[1.2vh] max-w-[92vw] text-center leading-[1.15]" style={{ fontSize: "min(5.2vh, 3.6vw)" }}>
          <span className="lb-code">{data.competition.code}</span> {data.competition.name}
        </h1>
      </header>

      <section className="relative z-10 mx-auto mt-[1.8vh] flex w-full min-h-0 flex-1 flex-col px-[4vw] pb-[3vh]" style={{ maxWidth: "1800px" }}>
        <div className="flex flex-1 min-h-0 flex-col rounded-[1.6vw] border border-white/10 bg-slate-950/45 p-[1.6vw] shadow-[0_10px_50px_rgba(2,6,23,0.6)] backdrop-blur-md">
          {/* Current event / status pill */}
          <div className="mx-auto flex w-[88%] items-center justify-between gap-4 rounded-full border border-sky-300/30 bg-gradient-to-r from-[#0b2a5b] via-[#1d4ed8]/70 to-[#0b2a5b] px-[2.4vw] py-[1.1vh] text-white shadow-lg"
            style={{ fontSize: "min(2.9vh, 2.1vw)" }}>
            <p className="truncate">Current Event: <span className="font-bold">{data.eventName}</span>{data.label ? <span className="text-white/60"> · {data.label}</span> : null}</p>
            <p className="flex shrink-0 items-center gap-2">
              Status: <span className="font-bold" style={{ color: st.color }}>{st.label}</span>
              {st.pulse && (
                <span className="inline-block h-[0.7em] w-[0.7em] rounded-full" style={{ background: st.color, boxShadow: `0 0 0 0.25em ${st.color}44`, animation: "lbPulse 1.4s ease-in-out infinite" }} />
              )}
            </p>
          </div>

          {/* Table */}
          <div className="mt-[2.2vh] flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1vw]">
            <div className="grid items-center rounded-t-[1vw] bg-gradient-to-b from-[#123a78] to-[#0b2a5b] px-[1vw] text-center text-sky-100" style={{ gridTemplateColumns: grid, fontSize: `min(2.6vh, 1.8vw)`, minHeight: "min(9vh, 7vw)" }}>
              {COLUMNS.map((c, i) => data.headerStyle === "ICON" ? (
                <span key={i} title={c.title} className="flex justify-center">
                  <c.icon className="h-[1.6em] w-[1.6em] text-sky-200 drop-shadow-[0_0_8px_rgba(125,211,252,0.6)]" strokeWidth={2.2} />
                </span>
              ) : (
                <span key={i} className="leading-tight">{c.label}</span>
              ))}
            </div>
            <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-[0.7vh] pt-[0.7vh]">
              {rows.length === 0 && (
                <p className="py-[6vh] text-center text-white/60" style={{ fontSize: "min(3vh, 2.2vw)" }}>Belum ada peserta bermula.</p>
              )}
              {rows.map((r) => (
                <div key={r.key} data-row={r.key} data-sig={sig(r)}
                  className={`relative grid items-center rounded-[0.6vw] px-[1vw] text-center tabular-nums ${r.rank === 1 ? "bg-gradient-to-r from-sky-500/30 via-sky-400/15 to-white/10 ring-1 ring-sky-300/50 shadow-[0_0_24px_rgba(56,189,248,0.25)]" : "bg-white/[0.07] ring-1 ring-white/5"}`}
                  style={{ gridTemplateColumns: grid, height: rowH, fontSize: font }}>
                  {/* Change flash (anime.js) */}
                  <span data-flash className="pointer-events-none absolute inset-0 rounded-[inherit] bg-amber-300/70 opacity-0" />
                  <span className="relative min-w-0 text-left" style={{ lineHeight: 1.1 }}>
                    <span className="flex items-baseline gap-[0.5em]" style={{ fontSize: "0.88em" }}>
                      <span className="lb-exo w-[1.6em] shrink-0 text-right font-bold text-sky-300">{r.rank ?? "–"}</span>
                      <span className="truncate font-semibold">{r.name}</span>
                    </span>
                    <span className="block truncate font-medium text-white/55" style={{ fontSize: "0.5em", paddingLeft: "3.3em", marginTop: "0.15em" }}>
                      {r.contingent ?? "—"}
                    </span>
                  </span>
                  {/* Progress bar */}
                  <span className="relative flex items-center gap-[0.45em] px-[0.4em]" title={`${r.completedStages}/${r.totalStages} peringkat`}>
                    <span className="relative h-[0.62em] flex-1 overflow-hidden rounded-full bg-white/15 shadow-inner">
                      <span data-bar data-pct={r.progress} className="absolute inset-y-0 left-0 w-0 rounded-full"
                        style={{ background: barFill(r), boxShadow: r.progress >= 100 ? "0 0 0.6em rgba(16,185,129,.55)" : undefined }} />
                    </span>
                    <span className="w-[2.6em] shrink-0 text-right font-semibold" style={{ fontSize: "0.8em" }}>{r.progress}%</span>
                  </span>
                  <span className="relative">{fmt(r.elapsedMs)}</span>
                  <span className="relative">{r.collisions ?? "---"}</span>
                  <span className={`relative ${r.penaltyMs ? "text-rose-300" : ""}`}>{r.penaltyMs == null ? "---" : fmt(r.penaltyMs)}</span>
                  <span className={`relative flex items-center justify-center gap-[0.4em] font-bold ${r.progress >= 100 ? "text-white" : "text-amber-300"}`}
                    title={`${r.progress >= 100 ? "Selesai" : "Belum selesai — masa setakat ini"}${r.elapsedMs != null ? ` · masa ${fmt(r.elapsedMs)} + penalti ${fmt(r.penaltyMs ?? 0)}` : ""}`}>
                    <TimeDonut r={r} />
                    <span className="w-[3.2em] text-left">{r.elapsedMs == null ? "---" : fmt(r.totalMs)}</span>
                  </span>
                </div>
              ))}
            </div>
            {pages > 1 && (
              <p className="pt-[0.8vh] text-center text-white/50" style={{ fontSize: "min(2vh, 1.5vw)" }}>
                Halaman {cur + 1} / {pages} · {data.rows.length} peserta
              </p>
            )}
          </div>
        </div>
      </section>

      {!idle && (
        <button onClick={toggleFull} className="absolute bottom-3 right-3 z-20 rounded-full bg-white/15 p-2.5 text-white shadow" aria-label="Skrin penuh">
          {isFull ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </button>
      )}
    </main>
  );
}
