"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Lock, Maximize, Minimize } from "lucide-react";

// Public big-screen medal tally by state. Polls every 30 s; a passcode, when
// the link has one, is asked once and kept on this device.

const REFRESH_MS = 30_000;

// Same fonts as the landing page: Rajdhani for text, Exo 2 for headings and numbers.
const FONT_CSS = `@import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;700;900&family=Rajdhani:wght@400;600;700&display=swap');
.mb-exo{font-family:'Exo 2',sans-serif}`;

type StateRow = {
  stateId: string | null; stateName: string; stateFlag: string | null;
  gold: number; silver: number; bronze: number; total: number; position: number;
};
type Data = {
  label: string | null;
  event: { name: string };
  states: StateRow[];
  competitions: { total: number; verified: number };
  updatedAt: string;
};
type Status = "loading" | "ready" | "passcode" | "closed" | "notfound" | "error";

const MEDALS = [
  { key: "gold", label: "Emas", ring: "#fcd34d", fill: "radial-gradient(circle at 35% 30%, #fff7cc, #fbbf24 45%, #b45309)", text: "#fcd34d" },
  { key: "silver", label: "Perak", ring: "#e5e7eb", fill: "radial-gradient(circle at 35% 30%, #ffffff, #cbd5e1 45%, #64748b)", text: "#e2e8f0" },
  { key: "bronze", label: "Gangsa", ring: "#fdba74", fill: "radial-gradient(circle at 35% 30%, #ffe4cc, #f97316 45%, #9a3412)", text: "#fdba74" },
] as const;

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};

function MedalDisc({ m, size }: { m: (typeof MEDALS)[number]; size: string }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: m.fill, boxShadow: `0 0 0 2px ${m.ring}55, 0 0 18px ${m.ring}40` }} />;
}

export function MedalBoardClient({ slug }: { slug: string }) {
  const pcKey = `medals_pc_${slug}`;
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<Data | null>(null);
  const [passcode, setPasscode] = useState("");
  const [pcError, setPcError] = useState("");
  const [checking, setChecking] = useState(false);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [now, setNow] = useState<Date | null>(null);
  const [isFull, setIsFull] = useState(false);
  const [idle, setIdle] = useState(false);
  const prev = useRef<Map<string, StateRow>>(new Map());
  // Bumped after a correct passcode to restart polling with it.
  const [run, setRun] = useState(0);

  const load = useCallback(async (code: string | null): Promise<Status> => {
    try {
      const res = await fetch(`/api/medals/${slug}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: code ?? "" }), cache: "no-store",
      });
      if (res.status === 404) return "notfound";
      if (res.status === 403) return "closed";
      if (res.status === 401) return "passcode";
      if (!res.ok) return "error";
      const j = (await res.json()) as Data;
      // Flash the medal counts that went up since the last refresh.
      const changed = new Set<string>();
      if (prev.current.size) {
        for (const s of j.states) {
          const p = prev.current.get(s.stateId ?? "");
          for (const m of MEDALS) if (s[m.key] > (p?.[m.key] ?? 0)) changed.add(`${s.stateId ?? ""}:${m.key}`);
        }
      }
      prev.current = new Map(j.states.map((s) => [s.stateId ?? "", s]));
      setData(j);
      if (changed.size) { setFlash(changed); setTimeout(() => setFlash(new Set()), 6000); }
      return "ready";
    } catch {
      return "error";
    }
  }, [slug]);

  // First load, then poll. A failed poll keeps the last good tally on screen.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const st = await load(store.get(pcKey));
      if (!alive) return;
      if (st === "passcode") store.del(pcKey);
      setStatus((cur) => (st === "error" && cur === "ready" ? cur : st));
      if (st === "ready" || st === "error" || st === "closed") timer = setTimeout(tick, REFRESH_MS);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [load, pcKey, run]);

  useEffect(() => {
    const t0 = setTimeout(() => setNow(new Date()), 0);
    const t = setInterval(() => setNow(new Date()), 1000);
    const onFs = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => { clearTimeout(t0); clearInterval(t); document.removeEventListener("fullscreenchange", onFs); };
  }, []);

  // Hide the cursor and the fullscreen button when the mouse rests.
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
    if (st === "ready") { store.set(pcKey, code); setRun((r) => r + 1); }
    setStatus(st);
  }

  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  const shell = "min-h-dvh w-full overflow-hidden text-white";
  const bg = { background: "radial-gradient(ellipse at 50% -10%, #1e3a8a 0%, #0b1736 45%, #020617 100%)", fontFamily: "'Rajdhani', sans-serif" };

  if (status !== "ready" || !data) {
    return (
      <main className={`${shell} flex items-center justify-center p-4`} style={bg}>
        <style>{FONT_CSS}</style>
        {status === "loading" && <Loader2 className="h-10 w-10 animate-spin text-white/40" />}
        {status === "passcode" && (
          <form onSubmit={submitPasscode} className="w-full max-w-sm space-y-5 rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur">
            <img src="/logos-white/mt-logo-white.svg" alt="Techlympics" className="mx-auto h-16 w-auto" />
            <div>
              <p className="mb-exo flex items-center justify-center gap-2 text-lg font-bold uppercase tracking-wide"><Lock className="h-4 w-4" /> Medal Tally</p>
              <p className="mt-1 text-sm text-white/50">Masukkan passcode untuk memaparkan kutipan pingat.</p>
            </div>
            <input value={passcode} autoFocus maxLength={6} inputMode="text" autoCapitalize="characters"
              onChange={(e) => setPasscode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.5em] outline-none focus:border-amber-300" />
            {pcError && <p className="text-sm text-red-300">{pcError}</p>}
            <button disabled={checking || passcode.length < 6}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 py-3 font-bold text-slate-900 disabled:opacity-40">
              {checking && <Loader2 className="h-4 w-4 animate-spin" />} Papar
            </button>
          </form>
        )}
        {(status === "closed" || status === "notfound" || status === "error") && (
          <div className="space-y-3 text-center">
            <img src="/logos-white/mt-logo-white.svg" alt="Techlympics" className="mx-auto h-20 w-auto opacity-70" />
            <p className="text-xl font-semibold">
              {status === "closed" ? "Paparan ini telah ditutup." : status === "notfound" ? "Pautan tidak dijumpai." : "Tidak dapat memuatkan medal tally."}
            </p>
            {status === "error" && <p className="text-sm text-white/50">Cuba lagi dalam 30 saat…</p>}
          </div>
        )}
      </main>
    );
  }

  const rows = data.states;
  const n = Math.max(rows.length, 1);
  // Every row fits on one screen: rows share the space left by the header and footer.
  const rowH = `min(8.5vh, calc(71vh / ${n}))`;
  // Capped by width too, so a portrait phone still fits the state names.
  const font = `min(calc(${rowH} * 0.46), 3.8vw)`;
  const grid = "minmax(2.5em,0.6fr) minmax(0,4fr) repeat(3, minmax(2.6em,1fr)) minmax(2.8em,1.1fr)";

  return (
    <main className={`${shell} flex h-dvh flex-col ${idle ? "cursor-none" : ""}`} style={bg}>
      <style>{`${FONT_CSS}\n@keyframes medalFlash{0%,100%{background:transparent}20%,60%{background:rgba(252,211,77,.28)}}`}</style>

      {/* Header */}
      <header className="flex shrink-0 items-center gap-[2vw] px-[3vw] pt-[2.2vh] pb-[1.6vh]">
        <img src="/logos-white/Jata-01-white.png" alt="Jata Negara" className="w-auto" style={{ height: "min(9vh, 10vw)" }} />
        <img src="/logos-white/mt-logo-white.svg" alt="Techlympics" className="w-auto" style={{ height: "min(8vh, 12vw)" }} />
        <div className="min-w-0 flex-1">
          <p className="mb-exo font-black uppercase leading-none tracking-wide" style={{ fontSize: "min(4.6vh, 3.4vw)" }}>Kutipan Pingat</p>
          <p className="mt-[0.6vh] truncate font-semibold uppercase tracking-widest text-white/60" style={{ fontSize: "min(2.6vh, 2.1vw)" }}>
            {data.event.name}{data.label ? ` · ${data.label}` : ""}
          </p>
        </div>
        <div className="text-right tabular-nums">
          <p className="mb-exo font-bold leading-none" style={{ fontSize: "min(4vh, 3vw)" }}>
            {now?.toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" }) ?? ""}
          </p>
          <p className="mt-[0.6vh] text-white/50" style={{ fontSize: "min(2.2vh, 1.8vw)" }}>
            {now?.toLocaleDateString("ms-MY", { weekday: "long", day: "numeric", month: "long" }) ?? ""}
          </p>
        </div>
      </header>

      {/* Table */}
      <section className="flex min-h-0 flex-1 flex-col px-[3vw]" style={{ fontSize: font }}>
        <div className="grid shrink-0 items-center border-b border-white/15 pb-[1vh] font-semibold uppercase tracking-wider text-white/50"
          style={{ gridTemplateColumns: grid, fontSize: "min(2.4vh, 1.9vw)" }}>
          <span className="text-center">#</span>
          <span className="pl-[1em]">Negeri</span>
          {MEDALS.map((m) => (
            <span key={m.key} className="flex flex-col items-center gap-[0.5vh]">
              <MedalDisc m={m} size="min(3.4vh, 2.6vw)" />
              <span style={{ color: m.text }}>{m.label}</span>
            </span>
          ))}
          <span className="text-center">Jumlah</span>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-center text-white/50" style={{ fontSize: "min(3vh, 2.4vw)" }}>
            Pingat akan dipaparkan sebaik sahaja keputusan disahkan.
          </div>
        ) : (
          <ol className="min-h-0">
            {rows.map((s, i) => {
              const key = s.stateId ?? "";
              const top = s.position <= 3 && s.total > 0;
              return (
                <li key={key || "none"} className="grid items-center border-b border-white/[0.07]"
                  style={{
                    gridTemplateColumns: grid, height: rowH,
                    background: top ? `linear-gradient(90deg, ${MEDALS[s.position - 1].ring}1f, transparent 70%)` : i % 2 ? "rgba(255,255,255,0.025)" : undefined,
                  }}>
                  <span className="mb-exo text-center font-black tabular-nums" style={{ color: top ? MEDALS[s.position - 1].text : "rgba(255,255,255,.55)" }}>
                    {s.total ? s.position : "–"}
                  </span>
                  <span className="flex min-w-0 items-center gap-[0.6em] pl-[1em]">
                    {s.stateFlag
                      ? <img src={s.stateFlag} alt="" className="shrink-0 rounded-[0.12em] object-cover shadow-md ring-1 ring-white/20" style={{ height: "1.15em", width: "1.8em" }} />
                      : <span className="shrink-0 rounded-[0.12em] bg-white/10" style={{ height: "1.15em", width: "1.8em" }} />}
                    <span className={`mb-exo truncate font-bold uppercase tracking-wide ${s.total ? "" : "text-white/55"}`}>{s.stateName}</span>
                  </span>
                  {MEDALS.map((m) => (
                    <span key={m.key} className="mb-exo mx-[0.2em] rounded-md text-center font-black tabular-nums"
                      style={{
                        color: s[m.key] ? m.text : "rgba(255,255,255,.2)",
                        animation: flash.has(`${key}:${m.key}`) ? "medalFlash 2s ease-in-out 3" : undefined,
                      }}>
                      {s[m.key]}
                    </span>
                  ))}
                  <span className="mb-exo text-center font-black tabular-nums" style={{ color: s.total ? "#fff" : "rgba(255,255,255,.2)" }}>{s.total}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Footer */}
      <footer className="flex shrink-0 items-center justify-between gap-4 px-[3vw] py-[1.6vh] text-white/50 font-semibold" style={{ fontSize: "min(2.1vh, 1.7vw)" }}>
        <span>{data.competitions.verified} daripada {data.competitions.total} pertandingan telah disahkan · Emas, perak dan gangsa bagi tempat 1, 2 dan 3</span>
        <span className="flex items-center gap-3">
          Dikemas kini {new Date(data.updatedAt).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          <button onClick={toggleFull} title={isFull ? "Keluar skrin penuh" : "Skrin penuh"}
            className={`rounded-md p-1.5 text-white/60 transition-opacity hover:bg-white/10 hover:text-white ${idle ? "opacity-0" : "opacity-100"}`}>
            {isFull ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </span>
      </footer>
    </main>
  );
}
