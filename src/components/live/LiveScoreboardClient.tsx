"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock, Maximize, Minimize } from "lucide-react";

// Public big-screen live scoreboard of a VibeBlocks walk-in competition.
// Polls every 5 s (the server caches VibeBlocks for 5 s); a passcode, when the
// link has one, is asked once and kept on this device. A failed poll keeps
// the last good board on screen.

const REFRESH_MS = 5_000;
/** Rows per screen; more entries rotate through pages. */
const PAGE_SIZE = 12;
const PAGE_MS = 10_000;
const FONT_CSS = `@import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@500;700;800&family=Rajdhani:wght@500;600;700&display=swap');
.lb-exo{font-family:'Exo 2',sans-serif}`;

type Row = {
  rank: number | null; name: string; contingent: string | null;
  status: "ready" | "in_progress" | "completed" | "timed_out";
  completedStages: number; totalStages: number; progress: number;
  collisions: number | null; elapsedMs: number | null; penaltyMs: number | null; totalMs: number | null;
};
type Data = {
  label: string | null;
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
  const pages = Math.max(1, Math.ceil((data?.rows.length ?? 0) / PAGE_SIZE));
  useEffect(() => {
    if (pages <= 1) return;
    const t = setInterval(() => setPage((p) => p + 1), PAGE_MS);
    return () => clearInterval(t);
  }, [pages]);

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
    background: "radial-gradient(ellipse at 50% -20%, #ffffff 0%, #dbe7f7 35%, #a9bfe0 70%, #8ea3d6 100%)",
    fontFamily: "'Rajdhani', sans-serif",
  };

  if (status !== "ready" || !data) {
    return (
      <main className="min-h-dvh w-full flex items-center justify-center p-4 text-slate-800" style={bg}>
        <style>{FONT_CSS}</style>
        {status === "loading" && <Loader2 className="h-10 w-10 animate-spin text-slate-500" />}
        {status === "passcode" && (
          <form onSubmit={submitPasscode} className="w-full max-w-sm space-y-5 rounded-2xl border border-white/70 bg-white/60 p-8 text-center shadow-xl backdrop-blur">
            <img src="/logo-mt.svg" alt="Malaysia Techlympics" className="mx-auto h-20 w-auto" />
            <div>
              <p className="lb-exo flex items-center justify-center gap-2 text-lg font-bold uppercase tracking-wide"><Lock className="h-4 w-4" /> Papan Skor Langsung</p>
              <p className="mt-1 text-sm text-slate-500">Masukkan passcode untuk memaparkan papan skor.</p>
            </div>
            <input value={passcode} autoFocus maxLength={32} autoCapitalize="characters"
              onChange={(e) => setPasscode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.4em] outline-none focus:border-[#0b2a5b]" />
            {pcError && <p className="text-sm text-red-600">{pcError}</p>}
            <button disabled={checking || passcode.length < 4}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0b2a5b] py-3 font-bold text-white disabled:opacity-40">
              {checking && <Loader2 className="h-4 w-4 animate-spin" />} Papar
            </button>
          </form>
        )}
        {(status === "closed" || status === "notfound" || status === "error" || status === "unavailable") && (
          <div className="space-y-3 text-center">
            <img src="/logo-mt.svg" alt="Malaysia Techlympics" className="mx-auto h-24 w-auto opacity-80" />
            <p className="text-xl font-semibold">
              {status === "closed" ? "Paparan ini telah ditutup."
                : status === "notfound" ? "Pautan tidak dijumpai."
                : status === "unavailable" ? (message || "Papan skor belum tersedia.")
                : "Tidak dapat memuatkan papan skor."}
            </p>
            {(status === "error" || status === "unavailable") && <p className="text-sm text-slate-500">Cuba lagi dalam 5 saat…</p>}
          </div>
        )}
      </main>
    );
  }

  const st = STATUS_STYLE[data.status];
  const cur = page % pages;
  const rows = data.rows.slice(cur * PAGE_SIZE, (cur + 1) * PAGE_SIZE);
  const n = Math.max(rows.length, pages > 1 ? PAGE_SIZE : 1);
  // Every row fits on one screen; rows share what the header leaves.
  const rowH = `min(9vh, calc(58vh / ${n}))`;
  const font = `min(calc(${rowH} * 0.42), 3.2vw)`;
  const grid = "minmax(0,2.2fr) minmax(0,1.4fr) minmax(0,1fr) minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,1.3fr)";

  return (
    <main className={`relative flex h-dvh w-full flex-col overflow-hidden text-slate-900 ${idle ? "cursor-none" : ""}`} style={bg}>
      <style>{`${FONT_CSS}\n@keyframes lbPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>

      <header className="flex shrink-0 flex-col items-center px-[3vw] pt-[2vh]">
        <img src="/logo-mt.svg" alt="Malaysia Techlympics" className="w-auto" style={{ height: "min(15vh, 22vw)" }} />
        <h1 className="lb-exo mt-[1vh] text-center font-bold leading-tight" style={{ fontSize: "min(5.6vh, 4.4vw)" }}>
          {data.competition.code} {data.competition.name}
        </h1>
      </header>

      <section className="mx-auto mt-[1.8vh] flex w-full min-h-0 flex-1 flex-col px-[4vw] pb-[3vh]" style={{ maxWidth: "1800px" }}>
        <div className="flex flex-1 min-h-0 flex-col rounded-[1.6vw] border border-white/70 bg-white/35 p-[1.6vw] shadow-[0_10px_40px_rgba(30,58,138,0.18)] backdrop-blur">
          {/* Current event / status pill */}
          <div className="mx-auto flex w-[88%] items-center justify-between gap-4 rounded-full border-2 border-white/60 bg-gradient-to-r from-[#0b2a5b] via-[#123a78] to-[#0b2a5b] px-[2.4vw] py-[1.1vh] text-white shadow-lg"
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
            <div className="grid items-center rounded-t-[1vw] bg-[#0b2a5b] px-[1vw] text-center text-white" style={{ gridTemplateColumns: grid, fontSize: `min(2.6vh, 1.8vw)`, minHeight: "min(9vh, 7vw)" }}>
              <span>Participant</span>
              <span className="leading-tight">Progress<br />(completion)</span>
              <span>Collision</span>
              <span>Time taken</span>
              <span>Penalty time</span>
              <span className="leading-tight">Total time<br />consumed</span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-[0.7vh] pt-[0.7vh]">
              {rows.length === 0 && (
                <p className="py-[6vh] text-center text-slate-600" style={{ fontSize: "min(3vh, 2.2vw)" }}>Belum ada peserta bermula.</p>
              )}
              {rows.map((r, i) => (
                <div key={`${r.name}-${i}`} className={`grid items-center rounded-[0.6vw] px-[1vw] text-center tabular-nums ${i === 0 && r.rank === 1 ? "bg-white shadow-md" : "bg-white/55"}`}
                  style={{ gridTemplateColumns: grid, height: rowH, fontSize: font }}>
                  <span className="min-w-0 text-left">
                    <span className="flex items-baseline gap-[0.5em]">
                      <span className="lb-exo w-[1.6em] shrink-0 text-right font-bold text-slate-500">{r.rank ?? "–"}</span>
                      <span className="truncate font-semibold">{r.name}</span>
                    </span>
                    {r.contingent && <span className="block truncate pl-[2.1em] text-slate-500" style={{ fontSize: "0.5em" }}>{r.contingent}</span>}
                  </span>
                  <span className="font-semibold" title={`${r.completedStages}/${r.totalStages} peringkat`}>{r.progress}%</span>
                  <span>{r.collisions ?? "---"}</span>
                  <span>{fmt(r.elapsedMs)}</span>
                  <span>{r.penaltyMs == null ? "---" : fmt(r.penaltyMs)}</span>
                  <span className="font-bold">{r.elapsedMs == null ? "---" : fmt(r.totalMs)}</span>
                </div>
              ))}
            </div>
            {pages > 1 && (
              <p className="pt-[0.8vh] text-center text-slate-600" style={{ fontSize: "min(2vh, 1.5vw)" }}>
                Halaman {cur + 1} / {pages} · {data.rows.length} peserta
              </p>
            )}
          </div>
        </div>
      </section>

      {!idle && (
        <button onClick={toggleFull} className="absolute bottom-3 right-3 rounded-full bg-[#0b2a5b]/80 p-2.5 text-white shadow" aria-label="Skrin penuh">
          {isFull ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </button>
      )}
    </main>
  );
}
