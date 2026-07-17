"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Camera, CameraOff, Scan, Loader2, ShieldCheck,
  CheckCircle2, RotateCcw, X, WifiOff,
  Search, ChevronRight, Users2,
} from "lucide-react";

/* ─── Brand palette ──────────────────────────────────────────────────────── */
const B = {
  navy:   "#0a3d6b",
  blue:   "#0288d1",
  gold:   "#f2dc0c",
  purple: "#8573b0",
};

/* ─── Types ──────────────────────────────────────────────────────────────── */

type EndpointInfo = {
  id: string;
  label: string | null;
  active: boolean;
  retiredAt: string | null;
  event: { id: string; name: string; slug: string; venue: string | null };
};

type ScanResult = {
  contingentName: string;
  logoUrl: string | null;
  teams: number;
  participants: number;
  trainers: number;
  attendedAt: string;
};

/* ─── Global CSS ─────────────────────────────────────────────────────────── */
const GLOBAL_CSS = `
  @keyframes at-float  { 0%,100%{transform:translateY(0) rotate(0deg) scale(1)} 50%{transform:translateY(-38px) rotate(180deg) scale(1.12)} }
  @keyframes at-pulse  { 0%,100%{opacity:.12} 50%{opacity:.3} }
  @keyframes at-scan   { 0%,100%{top:8%} 50%{top:83%} }
  @keyframes at-bar    { from{width:100%} to{width:0%} }
  @keyframes at-pop-in { 0%{opacity:0;transform:scale(.85) translateY(20px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
  @keyframes at-glow   { 0%,100%{box-shadow:0 0 30px rgba(2,136,209,.35)} 50%{box-shadow:0 0 60px rgba(2,136,209,.6),0 0 100px rgba(2,136,209,.2)} }
  .at-float  { animation: at-float  3s ease-in-out infinite }
  .at-pulse  { animation: at-pulse  2.8s ease-in-out infinite }
  .at-scan   { animation: at-scan   2s ease-in-out infinite }
  .at-pop-in { animation: at-pop-in .5s cubic-bezier(.34,1.56,.64,1) both }
  .at-glow   { animation: at-glow 3s ease-in-out infinite }
  #at-qr-reader { line-height: 0 }
  #at-qr-reader video  { width:100%!important; height:auto!important; display:block; border-radius:16px; }
  #at-qr-reader canvas { display:none!important }
  #at-qr-reader img    { display:none!important }
`;

/* ─── Background ─────────────────────────────────────────────────────────── */

const CUBE_DATA = Array.from({ length: 18 }, (_, i) => ({
  size:  20 + (i * 9) % 36,
  left:  `${(i * 5.5) % 98}%`,
  top:   `${(i * 11.3) % 95}%`,
  delay: `${(i * 0.41).toFixed(2)}s`,
  dur:   `${3 + (i % 5) * 0.55}s`,
  op:    0.07 + (i % 4) * 0.04,
}));

function TechBg() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {/* dot grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: `radial-gradient(circle, rgba(2,136,209,.08) 1px, transparent 1px)`,
        backgroundSize: "34px 34px",
      }} />
      {/* floating cubes */}
      {CUBE_DATA.map((c, i) => (
        <div
          key={i}
          className="absolute rounded-lg border border-white/20 at-float"
          style={{
            width: c.size, height: c.size,
            left: c.left, top: c.top,
            opacity: c.op,
            background: i % 3 === 0 ? "rgba(255,255,255,0.06)" : "rgba(2,136,209,0.07)",
            animationDelay: c.delay,
            animationDuration: c.dur,
          }}
        />
      ))}
      {/* binary strings */}
      {["10110100", "01001011", "11010010", "00110101"].map((b, i) => (
        <div
          key={b}
          className="absolute font-mono text-[9px] at-pulse select-none"
          style={{
            color: "rgba(242,220,12,.1)",
            top: `${18 + i * 19}%`,
            left: i % 2 === 0 ? "1.5%" : "87%",
            letterSpacing: "0.12em",
            animationDelay: `${i * 0.7}s`,
          }}
        >
          {b}
        </div>
      ))}
    </div>
  );
}

/* ─── Techlympics header logo ────────────────────────────────────────────── */
function TechLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-3"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-mt.svg"
        alt="Malaysia Techlympics"
        className={compact ? "h-7 w-auto brightness-0 invert" : "h-12 w-auto brightness-0 invert"}
      />
      {!compact && (
        <div>
          <p className="text-[9px] font-bold tracking-[0.25em] text-white/40 uppercase">Malaysia</p>
          <p className="text-sm font-extrabold tracking-[0.1em] text-white uppercase leading-tight"
            style={{ textShadow: `0 0 24px ${B.gold}50` }}>
            Techlympics 2026
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Greeting overlay ───────────────────────────────────────────────────── */
function GreetingOverlay({
  result,
  durationSecs,
  onDone,
}: {
  result: ScanResult;
  durationSecs: number;
  onDone: () => void;
}) {
  const total = durationSecs * 10;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= total) { clearInterval(id); onDone(); return total; }
        return e + 1;
      });
    }, 100);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const pct = Math.max(0, 100 - (elapsed / total) * 100);
  const secs = Math.ceil((total - elapsed) / 10);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: "linear-gradient(135deg, #050e1f 0%, #0a1e40 35%, #0d47a1 70%, #0288d1 100%)" }}
    >
      <style>{GLOBAL_CSS}</style>
      <TechBg />

      <div className="relative z-10 flex flex-col items-center gap-6 px-8 text-center at-pop-in">
        {/* Logo */}
        <TechLogo />

        {/* Divider */}
        <div className="h-px w-20 opacity-20" style={{ background: B.gold }} />

        {/* Contingent logo */}
        {result.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.logoUrl}
            alt={result.contingentName}
            className="h-20 w-20 rounded-full object-contain bg-white/10 p-1.5 shadow-xl at-glow"
          />
        )}

        {/* Greeting */}
        <div className="space-y-1">
          <p className="text-white/50 text-xs font-semibold tracking-[0.3em] uppercase">
            Selamat Datang
          </p>
          <h1
            className="text-white font-extrabold text-4xl md:text-5xl leading-tight drop-shadow-2xl max-w-2xl"
            style={{ textShadow: "0 2px 40px rgba(2,136,209,.5)" }}
          >
            {result.contingentName}
          </h1>
          <div className="flex items-center justify-center gap-1.5 mt-1">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-emerald-400 text-sm font-semibold">Kehadiran direkodkan</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-stretch gap-3 mt-1">
          {[
            { label: "Pasukan",   value: result.teams },
            { label: "Peserta",   value: result.participants },
            { label: "Jurulatih", value: result.trainers },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="flex flex-col items-center justify-center gap-1 rounded-2xl px-7 py-5 min-w-[100px]"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                backdropFilter: "blur(12px)",
              }}
            >
              <span className="text-white font-extrabold text-5xl tabular-nums leading-none">{value}</span>
              <span className="text-white/55 text-xs font-semibold mt-0.5">{label}</span>
            </div>
          ))}
        </div>

        {/* Countdown */}
        <div className="w-64 space-y-2 mt-2">
          <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.12)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: `linear-gradient(90deg, ${B.gold}, ${B.blue})`,
                transition: "width 100ms linear",
              }}
            />
          </div>
          <button
            type="button"
            onClick={onDone}
            className="w-full flex items-center justify-center gap-1.5 text-white/40 hover:text-white/70 text-xs transition-colors"
          >
            <X className="h-3 w-3" /> Tutup ({secs}s)
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Camera scanner ─────────────────────────────────────────────────────── */
const QR_DIV_ID = "at-qr-reader";

function CameraScanner({ onScan, onError }: {
  onScan: (text: string) => void; onError?: (msg: string) => void;
}) {
  const [active, setActive]           = useState(false);
  const [loading, setLoading]         = useState(false);
  const [manuallyOff, setManuallyOff] = useState(false);
  const scannerRef  = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const startingRef = useRef(false);

  const stopScanner = useCallback(async () => {
    if (!scannerRef.current) return;
    try {
      if (scannerRef.current.getState() === 2) await scannerRef.current.stop();
      document.getElementById(QR_DIV_ID)?.querySelectorAll("video").forEach((v) => {
        if (v.srcObject) { (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop()); v.srcObject = null; }
      });
    } catch { /* ignore */ }
    scannerRef.current = null; setActive(false);
  }, []);

  useEffect(() => () => { stopScanner(); }, [stopScanner]);

  async function startScanner() {
    if (startingRef.current || active) return;
    startingRef.current = true; setLoading(true);
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode(QR_DIV_ID);
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: "environment" }, { fps: 10 },
        (text) => { onScan(text); stopScanner(); },
        undefined,
      );
      setActive(true);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Kamera tidak dapat diakses.");
      scannerRef.current = null;
    }
    setLoading(false); startingRef.current = false;
  }

  useEffect(() => {
    const id = setTimeout(() => startScanner(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3 w-full">
      {/* Viewport */}
      <div className={`relative rounded-2xl overflow-hidden bg-black border border-white/10 ${active ? "" : "hidden"}`}>
        <div id={QR_DIV_ID} />
        {/* Scan frame overlay */}
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center gap-3">
          <div className="relative w-52 h-52" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}>
            <span className="absolute top-0 left-0 block w-10 h-10 border-t-[3px] border-l-[3px] rounded-tl"
              style={{ borderColor: B.gold }} />
            <span className="absolute top-0 right-0 block w-10 h-10 border-t-[3px] border-r-[3px] rounded-tr"
              style={{ borderColor: B.gold }} />
            <span className="absolute bottom-0 left-0 block w-10 h-10 border-b-[3px] border-l-[3px] rounded-bl"
              style={{ borderColor: B.gold }} />
            <span className="absolute bottom-0 right-0 block w-10 h-10 border-b-[3px] border-r-[3px] rounded-br"
              style={{ borderColor: B.gold }} />
            <div
              className="at-scan absolute left-0 right-0 h-0.5"
              style={{ background: `linear-gradient(90deg, transparent, ${B.gold}, transparent)` }}
            />
          </div>
          <p className="text-white/70 text-xs font-semibold tracking-widest uppercase">
            Imbas QR Kontingen
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm" style={{ color: "rgba(255,255,255,.4)" }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: B.gold }} />
          Menyambung kamera…
        </div>
      ) : active ? (
        <button
          type="button"
          onClick={() => { setManuallyOff(true); stopScanner(); }}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold"
          style={{ background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.4)", border: "1px solid rgba(255,255,255,.12)" }}
        >
          <CameraOff className="h-4 w-4" /> Hentikan kamera
        </button>
      ) : (
        <button
          type="button"
          onClick={() => { setManuallyOff(false); startScanner(); }}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all hover:scale-[1.02] active:scale-[.98]"
          style={{ background: `linear-gradient(90deg, ${B.navy}, #1565c0)`, color: "white" }}
        >
          <Camera className="h-4 w-4" />
          {manuallyOff ? "Imbas semula" : "Mulakan kamera"}
        </button>
      )}
    </div>
  );
}

/* ─── Barcode reader ─────────────────────────────────────────────────────── */
function BarcodeReader({ onScan, disabled }: { onScan: (code: string) => void; disabled?: boolean }) {
  const [buf, setBuf]       = useState("");
  const [focused, setFocused] = useState(true);
  const ref = useRef<HTMLInputElement>(null);

  // Keep focus at all times; restore it whenever the window regains focus or
  // any click happens outside the (hidden) input.
  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [disabled]);

  useEffect(() => {
    function restore() { if (!disabled) ref.current?.focus(); }
    window.addEventListener("click",   restore);
    window.addEventListener("keydown", restore);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) restore();
    });
    return () => {
      window.removeEventListener("click",   restore);
      window.removeEventListener("keydown", restore);
    };
  }, [disabled]);

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* Hidden capture input */}
      <input
        ref={ref}
        type="text"
        value={buf}
        onChange={(e) => setBuf(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const c = buf.trim();
            if (c) { onScan(c); setBuf(""); }
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          // Restore focus after a tick so external click handlers fire first
          setTimeout(() => { if (!disabled) ref.current?.focus(); }, 80);
        }}
        disabled={disabled}
        autoComplete="off"
        aria-hidden="true"
        className="sr-only"
      />

      {/* Visual indicator */}
      <div
        className="w-32 h-32 rounded-3xl flex flex-col items-center justify-center gap-2 relative"
        style={{
          background: focused
            ? "linear-gradient(135deg, rgba(16,185,129,.25), rgba(16,185,129,.1))"
            : `linear-gradient(135deg, rgba(2,136,209,.15), rgba(2,136,209,.08))`,
          border: focused
            ? "1.5px solid rgba(16,185,129,.5)"
            : "1.5px solid rgba(255,255,255,.1)",
          boxShadow: focused
            ? "0 0 32px rgba(16,185,129,.25), 0 0 64px rgba(16,185,129,.1)"
            : "none",
          transition: "all .3s ease",
        }}
      >
        <Scan
          className="h-14 w-14"
          style={{ color: focused ? "#34d399" : "rgba(255,255,255,.35)" }}
          strokeWidth={1.4}
        />
        {/* Pulsing dot */}
        <div className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{
              background: focused ? "#34d399" : "rgba(255,255,255,.2)",
              boxShadow: focused ? "0 0 8px #34d399" : "none",
              animation: focused ? "at-pulse 1.4s ease-in-out infinite" : "none",
            }}
          />
          <span
            className="text-[10px] font-bold tracking-widest uppercase"
            style={{ color: focused ? "#34d399" : "rgba(255,255,255,.25)" }}
          >
            {focused ? "Sedia" : "Tidak aktif"}
          </span>
        </div>
      </div>

      <p className="text-sm text-center max-w-xs" style={{ color: "rgba(255,255,255,.4)" }}>
        Halakan pengimbas 2D ke QR kontingen dan imbas.
        {!focused && (
          <span className="block mt-1 text-amber-400/70 text-xs">
            Klik mana-mana kawasan untuk mengaktifkan semula.
          </span>
        )}
      </p>
    </div>
  );
}

/* ─── Tab pill ───────────────────────────────────────────────────────────── */
function Pill({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-all"
      style={
        active
          ? { background: "rgba(255,255,255,0.14)", color: "white", border: "1px solid rgba(255,255,255,.2)" }
          : { background: "transparent", color: "rgba(255,255,255,.35)", border: "1px solid rgba(255,255,255,.07)" }
      }
    >
      {children}
    </button>
  );
}

/* ─── Manual search tab ──────────────────────────────────────────────────── */

type TeamEntry = {
  teamEventId: string; id: string; name: string; members: number; attendedAt: string | null;
};
type ContingentEntry = {
  id: string; name: string; shortName: string | null; logoUrl: string | null;
  trainers: number; attendedAt: string | null; teams: TeamEntry[];
};

function ManualTab({ code, passcode }: { code: string; passcode: string }) {
  const [q, setQ]               = useState("");
  const [results, setResults]   = useState<ContingentEntry[]>([]);
  const [loading, setLoading]   = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [logging, setLogging]   = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((query: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const sp = new URLSearchParams({ passcode, q: query });
        const res = await fetch(`/api/v2/attendance/${code}/search?${sp}`);
        const json = await res.json();
        setResults(json.contingents ?? []);
      } catch { /* ignore */ } finally { setLoading(false); }
    }, 300);
  }, [code, passcode]);

  useEffect(() => { search(""); }, [search]);

  async function logContingent(contingentId: string) {
    setLogging(contingentId);
    try {
      const res = await fetch(`/api/v2/attendance/${code}/log`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, contingentId }),
      });
      if (res.ok) search(q);
    } finally { setLogging(null); }
  }

  async function logTeam(teamId: string) {
    setLogging(teamId);
    try {
      const res = await fetch(`/api/v2/attendance/${code}/log`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, teamId }),
      });
      if (res.ok) search(q);
    } finally { setLogging(null); }
  }

  async function undoContingent(contingentId: string) {
    setLogging(contingentId);
    try {
      const res = await fetch(`/api/v2/attendance/${code}/log`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, contingentId }),
      });
      if (res.ok) search(q);
    } finally { setLogging(null); }
  }

  async function undoTeam(teamId: string) {
    setLogging(teamId);
    try {
      const res = await fetch(`/api/v2/attendance/${code}/log`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, teamId }),
      });
      if (res.ok) search(q);
    } finally { setLogging(null); }
  }

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
          style={{ color: "rgba(255,255,255,.3)" }} />
        <input
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); search(e.target.value); }}
          placeholder="Cari kontingen atau pasukan…"
          className="w-full h-11 rounded-xl pl-10 pr-10 text-sm text-white placeholder-white/20 focus:outline-none"
          style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)" }}
        />
        {loading && (
          <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin"
            style={{ color: "rgba(255,255,255,.35)" }} />
        )}
      </div>

      {/* Empty */}
      {!loading && results.length === 0 && (
        <p className="text-center text-sm py-8" style={{ color: "rgba(255,255,255,.3)" }}>
          {q ? "Tiada kontingen ditemui." : "Tiada pasukan berdaftar."}
        </p>
      )}

      {/* Results */}
      <div className="space-y-2">
        {results.map((c) => {
          const open    = expanded === c.id;
          const attended = !!c.attendedAt;
          const busy    = logging === c.id;

          return (
            <div
              key={c.id}
              className="rounded-2xl border overflow-hidden"
              style={{
                borderColor: attended ? "rgba(16,185,129,.3)" : "rgba(255,255,255,.1)",
                background:  attended ? "rgba(16,185,129,.07)" : "rgba(255,255,255,.05)",
              }}
            >
              {/* Contingent row */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : c.id)}
                  className="flex-1 flex items-center gap-3 text-left min-w-0"
                >
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 transition-transform`}
                    style={{
                      color: "rgba(255,255,255,.3)",
                      transform: open ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {c.shortName ?? c.name}
                    </p>
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,.35)" }}>
                      {c.teams.length} pasukan · {c.teams.reduce((s, t) => s + t.members, 0)} peserta · {c.trainers} jurulatih
                    </p>
                  </div>
                </button>

                {attended ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: "#34d399" }}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {fmtTime(c.attendedAt!)}
                    </div>
                    <button
                      type="button"
                      onClick={() => undoContingent(c.id)}
                      disabled={!!logging}
                      className="text-xs px-2 py-1 rounded-lg disabled:opacity-50 transition-all"
                      style={{ background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.4)", border: "1px solid rgba(255,255,255,.1)" }}
                    >
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => logContingent(c.id)}
                    disabled={!!logging}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
                    style={{ background: `linear-gradient(90deg, ${B.navy}, #1565c0)`, color: "white" }}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users2 className="h-3.5 w-3.5" />}
                    Daftar Kontingen
                  </button>
                )}
              </div>

              {/* Teams */}
              {open && (
                <div className="border-t divide-y divide-white/5" style={{ borderColor: "rgba(255,255,255,.06)" }}>
                  {c.teams.map((t) => {
                    const tAttended = !!t.attendedAt;
                    const tBusy     = logging === t.id;
                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-3 px-6 py-2.5"
                        style={{ background: tAttended ? "rgba(16,185,129,.05)" : "rgba(0,0,0,.1)" }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/80 truncate">{t.name}</p>
                          <p className="text-[10px]" style={{ color: "rgba(255,255,255,.3)" }}>{t.members} ahli</p>
                        </div>
                        {tAttended ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: "#34d399" }}>
                              <CheckCircle2 className="h-3 w-3" />{fmtTime(t.attendedAt!)}
                            </span>
                            <button
                              type="button"
                              onClick={() => undoTeam(t.id)}
                              disabled={!!logging}
                              className="p-1 rounded disabled:opacity-50"
                              style={{ color: "rgba(255,255,255,.3)" }}
                            >
                              {tBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => logTeam(t.id)}
                            disabled={!!logging}
                            className="shrink-0 text-xs px-2.5 py-1 rounded-lg font-semibold disabled:opacity-50 transition-all"
                            style={{ background: "rgba(2,136,209,.2)", color: "#7dd3fc", border: "1px solid rgba(2,136,209,.3)" }}
                          >
                            {tBusy ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "Daftar Pasukan"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Retired screen ─────────────────────────────────────────────────────── */
function RetiredScreen({ eventName }: { eventName: string }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #050e1f 0%, #0a1e40 50%, #0a3d6b 100%)" }}
    >
      <style>{GLOBAL_CSS}</style>
      <TechBg />
      <div className="relative z-10 flex flex-col items-center gap-6 px-8 text-center">
        <TechLogo />
        <div className="h-px w-24 opacity-15" style={{ background: B.gold }} />
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)" }}
        >
          <WifiOff className="h-8 w-8 text-white/40" />
        </div>
        <div className="space-y-2">
          <h2 className="text-white font-bold text-xl">Sesi Telah Tamat</h2>
          <p className="text-sm max-w-xs leading-relaxed" style={{ color: "rgba(255,255,255,.45)" }}>
            Endpoint kehadiran ini telah dipensyen. Sila hubungi penganjur untuk maklumat lanjut.
          </p>
          <p className="text-xs mt-2" style={{ color: "rgba(255,255,255,.25)" }}>{eventName}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */

type Phase = "gate" | "scanning" | "error";

export function AttendanceCounterClient({ code }: { code: string }) {
  const [info, setInfo]         = useState<EndpointInfo | null>(null);
  const [loadErr, setLoadErr]   = useState("");
  const [passcode, setPasscode] = useState("");
  const [gateErr, setGateErr]   = useState("");
  const [authed, setAuthed]     = useState(false);
  const [tab, setTab]           = useState<"manual" | "camera" | "scanner">("camera");
  const [phase, setPhase]       = useState<Phase>("gate");
  const [scanErr, setScanErr]   = useState("");
  const [greeting, setGreeting] = useState<ScanResult | null>(null);
  const [greetTimer]            = useState(10);
  const [scanKey, setScanKey]   = useState(0);

  useEffect(() => {
    fetch(`/api/v2/attendance/${code}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) { setLoadErr("Endpoint tidak dijumpai."); return; }
        setInfo(j.data);
      })
      .catch(() => setLoadErr("Ralat memuatkan maklumat endpoint."));
  }, [code]);

  async function handleGate() {
    if (!passcode.trim() || !info) return;
    // Quick validation: try a "dummy" scan just to verify passcode
    const res = await fetch(`/api/v2/attendance/${code}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contingentId: "_passcode_check_", passcode }),
    });
    // 403 = wrong passcode; 404 = passcode ok (contingent not found is fine for gate)
    if (res.status === 403) { setGateErr("Passcode tidak sah."); return; }
    setAuthed(true); setGateErr("");
  }

  async function handleScan(contingentId: string) {
    setPhase("scanning"); setScanErr("");
    try {
      const res = await fetch(`/api/v2/attendance/${code}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contingentId, passcode }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msgs: Record<string, string> = {
          CONTINGENT_NOT_FOUND: "QR tidak dikenali. Pastikan mengimbas QR kontingen yang betul.",
          NO_TEAMS_REGISTERED:  "Kontingen ini tiada pasukan berdaftar dalam acara ini.",
          INVALID_PASSCODE:     "Passcode tidak sah.",
        };
        setScanErr(msgs[json.error] ?? json.error ?? "Ralat tidak diketahui.");
        setPhase("error");
        return;
      }
      setGreeting(json);
      setPhase("gate"); // reset
    } catch {
      setScanErr("Ralat sambungan. Sila cuba lagi.");
      setPhase("error");
    }
  }

  function resetScan() {
    setPhase("gate"); setScanErr(""); setScanKey((k) => k + 1);
  }

  /* Page background style */
  const pageBg: React.CSSProperties = {
    minHeight: "100vh",
    background: "linear-gradient(150deg, #050e1f 0%, #0a1e40 55%, #0a3064 100%)",
    position: "relative",
    overflow: "hidden",
  };

  /* ── Loading ── */
  if (!info && !loadErr) return (
    <div style={pageBg} className="flex items-center justify-center">
      <style>{GLOBAL_CSS}</style>
      <TechBg />
      <Loader2 className="h-7 w-7 animate-spin relative z-10" style={{ color: B.gold }} />
    </div>
  );

  /* ── Load error ── */
  if (loadErr) return (
    <div style={pageBg} className="flex items-center justify-center p-6">
      <style>{GLOBAL_CSS}</style>
      <TechBg />
      <div
        className="relative z-10 rounded-2xl border border-white/10 p-8 max-w-sm w-full text-center space-y-3"
        style={{ background: "rgba(255,255,255,.06)", backdropFilter: "blur(16px)" }}
      >
        <TechLogo />
        <p className="text-sm font-medium text-red-400">{loadErr}</p>
      </div>
    </div>
  );

  /* ── Retired ── */
  if (!info!.active) return <RetiredScreen eventName={info!.event.name} />;

  /* ── Passcode gate ── */
  if (!authed) return (
    <div style={pageBg} className="flex flex-col items-center justify-center p-6 gap-8">
      <style>{GLOBAL_CSS}</style>
      <TechBg />
      <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-sm">
        <div className="flex flex-col items-center gap-3">
          <TechLogo />
          <div className="h-px w-24 opacity-20" style={{ background: B.gold }} />
        </div>

        <div
          className="w-full rounded-2xl border border-white/10 overflow-hidden"
          style={{ background: "rgba(255,255,255,.06)", backdropFilter: "blur(20px)" }}
        >
          <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${B.navy}, ${B.gold}, ${B.blue})` }} />
          <div className="p-7 space-y-5">
            <div className="text-center space-y-1.5">
              <div
                className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-1"
                style={{ background: `rgba(2,136,209,.25)`, border: `1px solid rgba(2,136,209,.4)` }}
              >
                <ShieldCheck className="h-5 w-5" style={{ color: "#7dd3fc" }} />
              </div>
              <p className="text-[10px] font-bold tracking-[0.22em] uppercase" style={{ color: B.gold }}>
                Log Kehadiran
              </p>
              <p className="text-base font-bold text-white">{info!.label ?? "Kaunter Kehadiran"}</p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,.4)" }}>{info!.event.name}</p>
              {info!.event.venue && (
                <p className="text-xs" style={{ color: "rgba(255,255,255,.28)" }}>{info!.event.venue}</p>
              )}
            </div>

            <div className="space-y-3">
              <label className="text-xs font-semibold tracking-wide block" style={{ color: "rgba(255,255,255,.45)" }}>
                PASSCODE KAUNTER
              </label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGate()}
                placeholder="••••••"
                className="w-full h-11 rounded-xl px-4 text-sm text-white placeholder-white/20 focus:outline-none"
                style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)" }}
              />
              {gateErr && <p className="text-xs text-red-400">{gateErr}</p>}
              <button
                type="button"
                onClick={handleGate}
                className="w-full h-11 rounded-xl text-sm font-bold transition-all hover:scale-[1.02] active:scale-[.98]"
                style={{ background: `linear-gradient(90deg, ${B.navy}, #1565c0)`, color: "white" }}
              >
                Masuk
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  /* ── Main scanner screen ── */
  return (
    <div style={pageBg}>
      <style>{GLOBAL_CSS}</style>
      <TechBg />

      {/* Greeting overlay */}
      {greeting && (
        <GreetingOverlay
          result={greeting}
          durationSecs={greetTimer}
          onDone={() => { setGreeting(null); resetScan(); }}
        />
      )}

      {/* Header */}
      <div
        className="relative z-10 border-b border-white/10 px-5 py-3.5 flex items-center gap-3"
        style={{ background: "rgba(0,0,0,.35)", backdropFilter: "blur(12px)" }}
      >
        <TechLogo compact />
        <div className="w-px h-5 bg-white/20" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{info!.label ?? "Log Kehadiran"}</p>
          <p className="text-[11px] truncate" style={{ color: "rgba(255,255,255,.38)" }}>{info!.event.name}</p>
        </div>
        <span
          className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0"
          style={{ background: "rgba(16,185,129,.15)", color: "#34d399", border: "1px solid rgba(16,185,129,.25)" }}
        >
          Aktif
        </span>
      </div>

      {/* Tab switcher */}
      <div className="relative z-10 px-5 pt-5 flex gap-2">
        <Pill active={tab === "manual"} onClick={() => { setTab("manual"); resetScan(); }}>
          <Search className="h-4 w-4" /> Manual
        </Pill>
        <Pill active={tab === "camera"} onClick={() => { setTab("camera"); resetScan(); }}>
          <Camera className="h-4 w-4" /> Kamera QR
        </Pill>
        <Pill active={tab === "scanner"} onClick={() => { setTab("scanner"); resetScan(); }}>
          <Scan className="h-4 w-4" /> Pengimbas 2D
        </Pill>
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-lg mx-auto p-5 space-y-4">
        {/* Manual tab — no scan phase applies */}
        {tab === "manual" ? (
          <ManualTab code={code} passcode={passcode} />
        ) : phase === "error" ? (
          <div
            className="rounded-2xl px-5 py-5 text-center space-y-4 border"
            style={{ background: "rgba(220,38,38,.1)", borderColor: "rgba(220,38,38,.25)" }}
          >
            <p className="text-sm font-semibold text-red-300">Ralat Imbasan</p>
            <p className="text-xs text-red-400/80">{scanErr}</p>
            <button
              type="button"
              onClick={resetScan}
              className="flex items-center gap-1.5 mx-auto px-5 py-2 rounded-xl text-sm font-semibold"
              style={{ background: `linear-gradient(90deg, ${B.navy}, #1565c0)`, color: "white" }}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Cuba Lagi
            </button>
          </div>
        ) : phase === "scanning" ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: B.gold }} />
            <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,.5)" }}>
              Merekod kehadiran…
            </p>
          </div>
        ) : tab === "camera" ? (
          <CameraScanner
            key={scanKey}
            onScan={handleScan}
            onError={(msg) => { setScanErr(msg); setPhase("error"); }}
          />
        ) : (
          <BarcodeReader
            key={scanKey}
            onScan={handleScan}
          />
        )}
      </div>
    </div>
  );
}
