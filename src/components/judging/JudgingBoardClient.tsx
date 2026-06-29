"use client";

import { useState } from "react";
import { Gavel, Loader2, Eye, EyeOff, Users, Lock, Trophy, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type Member = { name: string; gender: string; eduLevel: string };
type Team   = { id: string; name: string; contingent: string; contingentType: string; memberCount: number; members: Member[] };

type BoardData = {
  task:        { id: string; label: string | null; status: string };
  event:       { id: string; name: string; scope: string };
  competition: { id: string; name: string; code: string; participationType: string };
  template:    { id: string; name: string; code: string; description: string | null };
  isOnline:    boolean;
  teams:       Team[];
};

const GENDER_LABEL: Record<string, string> = { MALE: "L", FEMALE: "P" };
const EDU_LABEL: Record<string, string> = {
  PRIMARY: "Rendah", SECONDARY: "Menengah", YOUTH: "Belia", KINDERGARTEN: "Tadika",
};

// ── TeamCard ───────────────────────────────────────────────────────────────────

function TeamCard({ team, idx }: { team: Team; idx: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0 text-xs font-bold text-violet-700">
          {idx + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-zinc-900 leading-tight">{team.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{team.contingent}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <Users className="h-3 w-3 text-zinc-300" />
            <span className="text-xs text-zinc-500">{team.memberCount} ahli</span>
          </div>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-[10px] text-zinc-400 hover:text-zinc-600 shrink-0 mt-0.5"
        >
          {expanded ? "Sembunyikan" : "Ahli"}
        </button>
      </div>

      {expanded && team.members.length > 0 && (
        <div className="border-t bg-zinc-50 divide-y">
          {team.members.map((m, i) => (
            <div key={i} className="flex items-center gap-2 px-4 py-2 text-xs">
              <span className={cn(
                "w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0",
                m.gender === "MALE" ? "bg-sky-100 text-sky-700" : "bg-pink-100 text-pink-700"
              )}>
                {GENDER_LABEL[m.gender] ?? "?"}
              </span>
              <span className="flex-1 text-zinc-700">{m.name}</span>
              <span className="text-zinc-400">{EDU_LABEL[m.eduLevel] ?? m.eduLevel}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function JudgingBoardClient({ slug }: { slug: string }) {
  const [passcode, setPasscode] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [data,     setData]     = useState<BoardData | null>(null);

  async function handleVerify() {
    if (!passcode.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/judging/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcode.trim().toUpperCase() }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (j.error === "WRONG_PASSCODE") { setError("Passcode salah. Cuba semula."); return; }
        if (j.error === "TASK_CLOSED")    { setError("Tugas penghakiman ini telah ditutup."); return; }
        if (j.error === "NOT_FOUND")      { setError("Sesi penghakiman tidak dijumpai."); return; }
        setError(j.error ?? "Ralat tidak diketahui.");
        return;
      }
      setData(j);
    } finally { setLoading(false); }
  }

  // ── Passcode screen ──
  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          {/* Logo / title */}
          <div className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
              <Gavel className="h-8 w-8 text-amber-600" />
            </div>
            <h1 className="text-xl font-bold text-zinc-900">Papan Penghakiman</h1>
            <p className="text-sm text-zinc-500">Masukkan passcode yang diberikan untuk meneruskan.</p>
          </div>

          {/* Form */}
          <div className="bg-white rounded-2xl border shadow-sm p-6 space-y-4">
            <div className="relative">
              <Input
                value={passcode}
                onChange={e => setPasscode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && handleVerify()}
                type={showPass ? "text" : "password"}
                placeholder="Passcode"
                className="text-center tracking-[0.3em] font-mono text-lg h-12 pr-10"
                autoComplete="off"
                maxLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-3.5 text-zinc-400"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {error && (
              <p className="text-sm text-red-500 text-center flex items-center justify-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />{error}
              </p>
            )}
            <Button
              onClick={handleVerify}
              disabled={loading || passcode.length < 6}
              className="w-full h-11 bg-amber-500 hover:bg-amber-600 text-white font-semibold"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Masuk
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Board screen ──
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <Gavel className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-zinc-900 text-sm leading-tight">{data.event.name}</p>
              <span className="text-[10px] bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-mono">{data.event.scope}</span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="flex items-center gap-1 text-xs text-zinc-500">
                <Trophy className="h-3 w-3 text-amber-400" />{data.competition.name}
              </span>
              <span className="flex items-center gap-1 text-xs text-zinc-500">
                <Tag className="h-3 w-3 text-violet-400" />{data.template.name}
              </span>
              {data.task.label && (
                <span className="text-xs font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded">
                  {data.task.label}
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-zinc-400">{data.teams.length} pasukan</p>
            <p className="text-[10px] text-zinc-300 mt-0.5">{data.isOnline ? "Online" : "Fizikal"}</p>
          </div>
        </div>
      </div>

      {/* Teams grid */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {data.teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-3">
            <Users className="h-10 w-10 text-zinc-200" />
            <p className="text-sm">Tiada pasukan berdaftar untuk pertandingan ini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.teams.map((team, idx) => (
              <TeamCard key={team.id} team={team} idx={idx} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
