"use client";

import { useState, useEffect } from "react";
import { Trophy, Loader2, Eye, EyeOff, Lock, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type RankEntry = {
  rank: number; teamId: string; teamName: string;
  contingentName: string; contingentShortName: string | null;
  contingentLogo: string | null;
  totalScore: number; bestTime: number | null;
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
    return (
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt={name} onError={() => setErr(true)}
        className={cn(cls, "rounded-full object-cover border-2 border-white/20 shadow-lg")} />
    );
  }
  return (
    <div className={cn(cls, "rounded-full bg-gradient-to-br from-white/20 to-white/5 border-2 border-white/20 flex items-center justify-center font-bold text-white shadow-lg")}>
      {initials}
    </div>
  );
}

// ── Podium ─────────────────────────────────────────────────────────────────────

const PODIUM_CONFIG = [
  { pos: 2, height: "h-24", bg: "from-slate-400/30 to-slate-500/20", border: "border-slate-300/30", label: "text-slate-200", icon: "🥈" },
  { pos: 1, height: "h-36", bg: "from-amber-400/30 to-amber-600/20", border: "border-amber-300/40", label: "text-amber-200", icon: "🥇" },
  { pos: 3, height: "h-16", bg: "from-orange-400/30 to-orange-600/20", border: "border-orange-300/30", label: "text-orange-200", icon: "🥉" },
];

function Podium({ rankings }: { rankings: RankEntry[] }) {
  const top3 = [rankings[1], rankings[0], rankings[2]]; // silver, gold, bronze order

  return (
    <div className="flex items-end justify-center gap-3 mb-8 px-4">
      {PODIUM_CONFIG.map(({ pos, height, bg, border, label, icon }, i) => {
        const team = top3[i];
        if (!team) return <div key={pos} className="w-36" />;
        return (
          <div key={pos} className="flex flex-col items-center gap-2 flex-1 max-w-[200px]">
            {/* Team info above podium */}
            <div className="text-center space-y-1.5">
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

function RankingsTable({ rankings }: { rankings: RankEntry[] }) {
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
            <tr key={r.teamId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
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
  const [restoring, setRestoring] = useState(() =>
    typeof window !== "undefined" && !!sessionStorage.getItem(`results_pc_${slug}`)
  );
  const [error, setError] = useState("");
  const [data, setData] = useState<BoardData | null>(null);
  const [activeComp, setActiveComp] = useState("");
  const [needsPasscode, setNeedsPasscode] = useState(false);

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
        if (j.error === "WRONG_PASSCODE" || j.error === "MISSING_PASSCODE") {
          setNeedsPasscode(true);
        } else if (!j.error) {
          setData(j);
          setActiveComp(j.competitions[0]?.id ?? "");
          if (stored) sessionStorage.setItem(`results_pc_${slug}`, stored);
        } else if (j.error === "TASK_CLOSED") {
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
        if (j.error === "WRONG_PASSCODE") { setError("Passcode salah. Cuba semula."); return; }
        if (j.error === "TASK_CLOSED")    { setError("Paparan keputusan ini telah ditutup."); return; }
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
          {activeResult.rankings.length >= 2 && <Podium rankings={activeResult.rankings} />}

          {/* Rank 1 only */}
          {activeResult.rankings.length === 1 && (
            <div className="flex flex-col items-center gap-4 py-8">
              <ContingentLogo logo={activeResult.rankings[0].contingentLogo} name={activeResult.rankings[0].contingentName} size="xl" />
              <div className="text-center">
                <p className="text-4xl font-black">{activeResult.rankings[0].teamName}</p>
                <p className="text-white/60 mt-1">{activeResult.rankings[0].contingentName}</p>
                <p className="text-5xl font-black text-amber-300 mt-3">{activeResult.rankings[0].totalScore.toFixed(1)}</p>
              </div>
            </div>
          )}

          {/* Rest of rankings */}
          <RankingsTable rankings={activeResult.rankings} />
        </div>
      )}
    </div>
  );
}
