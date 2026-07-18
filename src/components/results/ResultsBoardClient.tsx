"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Trophy, Loader2, Eye, EyeOff, Lock, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type RankEntry = {
  rank: number; teamId: string; teamName: string;
  contingentName: string; contingentShortName: string | null;
  contingentLogo: string | null;
  totalScore: number; bestTime: number | null;
  members: { id: string; name: string }[];
};

type CompetitionResult = { id: string; name: string; code: string; rankings: RankEntry[] };

type BoardData = {
  endpoint: { id: string; label: string | null; status: string };
  event:    { id: string; name: string; scope: string; startDate: string | null; endDate: string | null };
  competitions: CompetitionResult[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(s: number) {
  const m = Math.floor(s / 60); const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function ContingentLogo({ logo, name, size = "md" }: { logo: string | null; name: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const [err, setErr] = useState(false);
  const sizeMap = { sm: "w-8 h-8 text-xs", md: "w-12 h-12 text-sm", lg: "w-16 h-16 text-base", xl: "w-24 h-24 text-xl" };
  const cls = sizeMap[size];
  const initials = name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

  if (logo && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt={name} onError={() => setErr(true)}
      className={cn(cls, "rounded-full object-cover border-2 border-white/20 shadow-lg")} />;
  }
  return (
    <div className={cn(cls, "rounded-full bg-gradient-to-br from-white/20 to-white/5 border-2 border-white/20 flex items-center justify-center font-bold text-white shadow-lg")}>
      {initials}
    </div>
  );
}

// ── Rank label (Malay ordinal) ─────────────────────────────────────────────────

function tempatLabel(rank: number): string {
  const named: Record<number, string> = { 1: "Pertama", 2: "Kedua", 3: "Ketiga" };
  return `Tempat ${named[rank] ?? `Ke-${rank}`}`;
}

function rankColor(rank: number): string {
  if (rank === 1) return "text-amber-300";
  if (rank === 2) return "text-slate-300";
  if (rank === 3) return "text-orange-400";
  return "text-white/80";
}

// ── Partner logos ──────────────────────────────────────────────────────────────

const PARTNER_LOGOS = [
  "madani-white.svg",
  "might-white.svg",
  "motto-white.svg",
  "my-book-of-record-white.svg",
  "rakan-muda-white.svg",
  "visit-my-white.svg",
];

// ── Animated wave background ──────────────────────────────────────────────────

const WAVES = [
  { color: "rgba(30,  120, 255, 0.55)", glow: "rgba(30, 120, 255, 0.4)",  speed: 0.40, amp: 65, freq: 0.90, yOff: 0.42, width: 16 },
  { color: "rgba(0,   220, 200, 0.50)", glow: "rgba(0,  220, 200, 0.35)", speed: 0.28, amp: 85, freq: 0.65, yOff: 0.50, width: 13 },
  { color: "rgba(50,  200,  80, 0.48)", glow: "rgba(50, 200,  80, 0.30)", speed: 0.50, amp: 55, freq: 1.05, yOff: 0.56, width: 11 },
  { color: "rgba(255, 170,   0, 0.45)", glow: "rgba(255,170,   0, 0.30)", speed: 0.35, amp: 72, freq: 0.75, yOff: 0.53, width: 10 },
];

function WaveCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let t = 0;

    function resize() {
      if (!canvas) return;
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function draw() {
      if (!canvas || !ctx) return;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      for (const w of WAVES) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 3) {
          const y = H * w.yOff + Math.sin((x / W) * Math.PI * 2 * w.freq + t * w.speed) * w.amp;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.shadowBlur  = 28;
        ctx.shadowColor = w.glow;
        ctx.strokeStyle = w.color;
        ctx.lineWidth   = w.width;
        ctx.lineCap     = "round";
        ctx.stroke();
        ctx.shadowBlur  = 0;
      }

      t += 0.018;
      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none opacity-80"
    />
  );
}

// ── Team spotlight overlay ─────────────────────────────────────────────────────

function TeamSpotlight({
  entry,
  eventName,
  onClose,
}: {
  entry: RankEntry;
  eventName: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 overflow-y-auto"
      onClick={onClose}
    >
      <style>{`
        @keyframes jump1 {
          0%, 100% { transform: translateY(0); }
          40%       { transform: translateY(-18px); }
          60%       { transform: translateY(-10px); }
        }
        @keyframes jump2 {
          0%, 100% { transform: translateY(0); }
          40%       { transform: translateY(-22px); }
          60%       { transform: translateY(-12px); }
        }
      `}</style>

      <WaveCanvas />

      {/* Winner figures — bottom-left: 5 (back), 2 + 1 (front) */}
      <div className="absolute bottom-0 left-0 z-10 pointer-events-none" style={{ width: "420px", height: "500px" }}>
        {/* 5 — back layer, largest */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/winner/5.png" alt="" className="absolute bottom-0 select-none" style={{ width: "460px", left: "20px", zIndex: 0 }} />
        {/* 2 — front left */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/winner/2.png" alt="" className="absolute bottom-0 left-0 select-none" style={{ width: "130px", zIndex: 1 }} />
        {/* 1 — front right */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/winner/1.png" alt="" className="absolute bottom-0 select-none" style={{ width: "160px", left: "240px", zIndex: 1 }} />
      </div>

      {/* Winner figures — bottom-right: 3, 4 (jumping) */}
      <div className="absolute bottom-16 right-0 z-10 flex items-end pointer-events-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/winner/3.png" alt="" className="w-28 md:w-36 select-none"
          style={{ animation: "jump1 1.6s ease-in-out infinite" }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/winner/4.png" alt="" className="w-28 md:w-36 select-none -ml-4"
          style={{ animation: "jump2 1.6s ease-in-out 0.25s infinite" }} />
      </div>

      {/* Close button */}
      <button
        className="absolute top-4 right-4 z-10 text-white/50 hover:text-white transition-colors"
        onClick={onClose}
      >
        <X className="h-7 w-7" />
      </button>

      {/* Content — stop propagation so clicks inside don't close */}
      <div
        className="relative z-10 flex flex-col items-center justify-between min-h-screen px-6 py-10 gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top: Techlympics logo + event name */}
        <div className="flex flex-col items-center gap-3 pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mt.svg" alt="Techlympics" className="h-14 w-auto brightness-0 invert opacity-90" />
          <p className="text-white font-black tracking-widest text-center max-w-xs uppercase">{eventName}</p>
        </div>

        {/* Middle: rank + team info */}
        <div className="flex flex-col items-center gap-5 text-center">
          {/* Rank label */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-3">
              <div className="h-px w-12 bg-white/20" />
              <p className="text-3xl md:text-4xl font-black tracking-wide uppercase drop-shadow-lg text-amber-400">
                {tempatLabel(entry.rank)}
              </p>
              <div className="h-px w-12 bg-white/20" />
            </div>
            <p className="text-white/30 text-xs font-mono">#{entry.rank}</p>
          </div>

          {/* Contingent logo + name */}
          <div className="flex flex-col items-center gap-3">
            <ContingentLogo logo={entry.contingentLogo} name={entry.contingentName} size="xl" />
            <div>
              <p className="text-amber-400 text-2xl md:text-3xl font-black tracking-wide uppercase drop-shadow-lg" style={{ WebkitTextStroke: "1px rgba(0,0,0,0.6)" }}>
                {entry.contingentName}
              </p>
              {entry.contingentShortName && (
                <p className="text-white/50 text-sm mt-0.5">{entry.contingentShortName}</p>
              )}
            </div>
          </div>

          {/* Team name */}
          <p className="text-white text-2xl md:text-3xl font-black drop-shadow-lg">{entry.teamName}</p>



          {/* Members */}
          {entry.members.length > 0 && (
            <div className="mt-2 w-full max-w-xs text-center">
              <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest mb-3">Ahli Pasukan</p>
              <ul className="space-y-1.5">
                {entry.members.map((m) => (
                  <li key={m.id} className="text-sm text-white/80 font-medium">{m.name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Bottom: partner logos */}
        <div className="w-full -mx-6 px-6 py-4 bg-black/40 flex flex-wrap justify-center items-center gap-5">
          {PARTNER_LOGOS.map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={f} src={`/logos-white/${f}`} alt={f.replace("-white.svg", "")} className="h-8 w-auto opacity-60" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Podium ─────────────────────────────────────────────────────────────────────

const PODIUM_CONFIG = [
  { pos: 2, height: "h-24", bg: "from-slate-400/30 to-slate-500/20", border: "border-slate-300/30", label: "text-slate-200", icon: "🥈" },
  { pos: 1, height: "h-36", bg: "from-amber-400/30 to-amber-600/20", border: "border-amber-300/40", label: "text-amber-200", icon: "🥇" },
  { pos: 3, height: "h-16", bg: "from-orange-400/30 to-orange-600/20", border: "border-orange-300/30", label: "text-orange-200", icon: "🥉" },
];

function Podium({ rankings, onSelect }: { rankings: RankEntry[]; onSelect: (e: RankEntry) => void }) {
  const top3 = [rankings[1], rankings[0], rankings[2]]; // silver, gold, bronze order

  return (
    <div className="flex items-end justify-center gap-3 mb-8 px-4">
      {PODIUM_CONFIG.map(({ pos, height, bg, border, label, icon }, i) => {
        const team = top3[i];
        if (!team) return <div key={pos} className="w-36" />;
        return (
          <div
            key={pos}
            className="flex flex-col items-center gap-2 flex-1 max-w-[200px] cursor-pointer group"
            onClick={() => onSelect(team)}
          >
            {/* Team info above podium */}
            <div className="text-center space-y-1.5 transition-transform group-hover:scale-105 duration-200">
              <ContingentLogo logo={team.contingentLogo} name={team.contingentName} size={pos === 1 ? "xl" : "lg"} />
              <p className={cn("font-black leading-tight drop-shadow", pos === 1 ? "text-base text-white" : "text-sm text-white/80")}>
                {team.teamName}
              </p>
              <p className={cn("text-xs truncate max-w-[150px]", label)}>
                {team.contingentShortName ?? team.contingentName}
              </p>
              <p className={cn("font-black text-2xl drop-shadow", pos === 1 ? "text-amber-300" : pos === 2 ? "text-slate-200" : "text-orange-300")}>
                {team.totalScore.toFixed(1)}
              </p>
              {team.bestTime != null && (
                <p className="text-[11px] text-sky-300 font-mono">{fmtTime(team.bestTime)}</p>
              )}
            </div>
            {/* Podium block */}
            <div className={cn(
              "w-full rounded-t-xl border backdrop-blur-sm flex items-center justify-center",
              height, `bg-gradient-to-b ${bg}`, border
            )}>
              <span className="text-3xl">{icon}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Rankings table (rank 4+) ───────────────────────────────────────────────────

function RankingsTable({ rankings, onSelect }: { rankings: RankEntry[]; onSelect: (e: RankEntry) => void }) {
  const rest = rankings.slice(3);
  if (!rest.length) return null;

  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden backdrop-blur-sm bg-white/5 mx-4 mb-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-white/40 uppercase tracking-wider w-12">#</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-white/40 uppercase tracking-wider">Pasukan</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-white/40 uppercase tracking-wider">Kontinjen</th>
            <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-white/40 uppercase tracking-wider w-20">Markah</th>
            <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-white/40 uppercase tracking-wider w-20">Masa</th>
          </tr>
        </thead>
        <tbody>
          {rest.map(r => (
            <tr
              key={r.teamId}
              className="border-b border-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              onClick={() => onSelect(r)}
            >
              <td className="px-4 py-3 text-white/50 font-bold text-sm">{r.rank}</td>
              <td className="px-4 py-3 text-white font-medium">{r.teamName}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <ContingentLogo logo={r.contingentLogo} name={r.contingentName} size="sm" />
                  <span className="text-white/70 text-sm truncate max-w-[180px]">{r.contingentName}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-right font-bold text-rose-300">{r.totalScore.toFixed(1)}</td>
              <td className="px-4 py-3 text-right font-mono text-sky-300 text-xs">
                {r.bestTime != null ? fmtTime(r.bestTime) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function ResultsBoardClient({ slug }: { slug: string }) {
  const [passcode, setPasscode] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<BoardData | null>(null);
  const [activeComp, setActiveComp] = useState("");
  const [needsPasscode, setNeedsPasscode] = useState(false);
  const [spotlight, setSpotlight] = useState<RankEntry | null>(null);
  const openSpotlight = useCallback((e: RankEntry) => setSpotlight(e), []);

  // Try public access first (no passcode), or restore stored passcode
  useEffect(() => {
    const stored = sessionStorage.getItem(`results_pc_${slug}`);

    fetch(`/api/results/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: stored ?? "" }),
    })
      .then(r => r.json())
      .then(j => {
        if (j.error === "PASSCODE_REQUIRED") {
          setNeedsPasscode(true);
        } else if (j.error === "INVALID_PASSCODE") {
          sessionStorage.removeItem(`results_pc_${slug}`);
          setNeedsPasscode(true);
          setError("Passcode salah. Cuba semula.");
        } else if (!j.error) {
          setData(j);
          setActiveComp(j.competitions[0]?.id ?? "");
          if (stored) sessionStorage.setItem(`results_pc_${slug}`, stored);
        } else if (j.error === "ENDPOINT_CLOSED") {
          setError("Paparan keputusan ini telah ditutup.");
        } else {
          setError(j.error ?? "Ralat tidak diketahui.");
        }
      })
      .catch(() => { if (!stored) setNeedsPasscode(true); })
      .finally(() => setRestoring(false));
  }, [slug]);

  async function handleVerify() {
    if (!passcode.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/results/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcode.trim().toUpperCase() }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (j.error === "INVALID_PASSCODE") { setError("Passcode salah. Cuba semula."); return; }
        if (j.error === "ENDPOINT_CLOSED") { setError("Paparan keputusan ini telah ditutup."); return; }
        if (j.error === "NOT_FOUND")      { setError("Paparan keputusan tidak dijumpai."); return; }
        setError(j.error ?? "Ralat tidak diketahui."); return;
      }
      sessionStorage.setItem(`results_pc_${slug}`, passcode.trim().toUpperCase());
      setData(j);
      setActiveComp(j.competitions[0]?.id ?? "");
    } finally { setLoading(false); }
  }

  // ── Loading ──
  if (restoring) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-white/30" />
      </div>
    );
  }

  // ── Passcode screen ──
  if (needsPasscode && !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-20 h-20 rounded-3xl bg-rose-500/20 border border-rose-400/20 flex items-center justify-center">
              <Trophy className="h-10 w-10 text-rose-400" />
            </div>
            <h1 className="text-2xl font-black text-white">Keputusan</h1>
            <p className="text-sm text-white/50">Masukkan passcode untuk melihat keputusan.</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4 backdrop-blur-sm">
            <div className="relative">
              <Input value={passcode} onChange={e => setPasscode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && handleVerify()}
                type={showPass ? "text" : "password"}
                placeholder="Passcode" maxLength={6}
                className="text-center tracking-[0.3em] font-mono text-lg h-12 pr-10 bg-white/5 border-white/20 text-white placeholder:text-white/30"
                autoComplete="off" />
              <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-3.5 text-white/40">
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {error && (
              <p className="text-sm text-red-400 text-center flex items-center justify-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />{error}
              </p>
            )}
            <Button onClick={handleVerify} disabled={loading || passcode.length < 6}
              className="w-full h-11 bg-rose-600 hover:bg-rose-500 text-white font-semibold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Masuk
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Error screen ──
  if (error && !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <p className="text-white/50 text-sm">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const activeResult = data.competitions.find(c => c.id === activeComp) ?? data.competitions[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Header */}
      <div className="relative border-b border-white/10 backdrop-blur-sm bg-black/20">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-400/20 flex items-center justify-center shrink-0">
            <Trophy className="h-5 w-5 text-rose-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-lg leading-tight truncate">{data.event.name}</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {data.endpoint.label && (
                <span className="text-xs font-semibold text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded-full">
                  {data.endpoint.label}
                </span>
              )}
              <span className="text-[10px] text-white/30 font-mono">{data.event.scope}</span>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-1 text-amber-300">
            <Star className="h-4 w-4 fill-amber-300" />
            <span className="text-xs font-bold">KEPUTUSAN RASMI</span>
          </div>
        </div>
      </div>

      {/* Competition tabs */}
      {data.competitions.length > 1 && (
        <div className="border-b border-white/5 bg-black/10">
          <div className="max-w-4xl mx-auto px-6 py-2 flex gap-2 overflow-x-auto">
            {data.competitions.map(c => (
              <button key={c.id} onClick={() => setActiveComp(c.id)}
                className={cn("text-xs px-4 py-1.5 rounded-full font-semibold whitespace-nowrap transition-all",
                  activeComp === c.id
                    ? "bg-rose-600 text-white shadow-lg"
                    : "text-white/40 hover:text-white/70 hover:bg-white/5"
                )}>
                {c.code} — {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Competition name */}
      {activeResult && (
        <div className="max-w-4xl mx-auto px-6 pt-8 pb-4 text-center">
          <p className="text-xs font-semibold text-white/30 uppercase tracking-[0.2em] mb-1">{activeResult.code}</p>
          <h2 className="text-2xl font-black text-white">{activeResult.name}</h2>
        </div>
      )}

      {!activeResult || activeResult.rankings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-white/30">
          <Trophy className="h-12 w-12" />
          <p className="text-sm">Tiada keputusan direkodkan lagi.</p>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto pb-12">
          {/* Top 3 podium */}
          {activeResult.rankings.length >= 2 && (
            <Podium rankings={activeResult.rankings} onSelect={openSpotlight} />
          )}

          {/* Rank 1 only */}
          {activeResult.rankings.length === 1 && (
            <div
              className="flex flex-col items-center gap-4 py-8 cursor-pointer group"
              onClick={() => openSpotlight(activeResult.rankings[0])}
            >
              <ContingentLogo logo={activeResult.rankings[0].contingentLogo} name={activeResult.rankings[0].contingentName} size="xl" />
              <div className="text-center transition-transform group-hover:scale-105 duration-200">
                <p className="text-4xl font-black">{activeResult.rankings[0].teamName}</p>
                <p className="text-white/60 mt-1">{activeResult.rankings[0].contingentName}</p>
                <p className="text-5xl font-black text-amber-300 mt-3">{activeResult.rankings[0].totalScore.toFixed(1)}</p>
              </div>
            </div>
          )}

          {/* Rest of rankings */}
          <RankingsTable rankings={activeResult.rankings} onSelect={openSpotlight} />
        </div>
      )}

      {/* Team spotlight overlay */}
      {spotlight && (
        <TeamSpotlight
          entry={spotlight}
          eventName={data.event.name}
          onClose={() => setSpotlight(null)}
        />
      )}
    </div>
  );
}
