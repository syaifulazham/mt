"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Gavel, Loader2, Eye, EyeOff, Users, Lock, Trophy, Tag, ClipboardPen, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type COption = { id: string; label: string; weight: number; order: number };
type Criterion = {
  id: string; name: string; order: number; type: string;
  maxScore: number | null; minScore: number | null; maxTime: number | null;
  options: COption[];
};
type Participant = {
  id: string; name: string; gender: string; eduLevel: string; age: number | null;
  classGrade: string | null; className: string | null;
  contingent: string; contingentShortName: string | null; contingentType: string;
};
type ScoreRow = {
  id: string; walkInJudgingEndpointId: string; walkInRegistrationId: string; criterionId: string;
  score: number | null; timeSeconds: number | null; optionIds: string[];
};
type BoardData = {
  task:        { id: string; label: string | null; status: string };
  event:       { id: string; name: string; scope: string };
  competition: { id: string; name: string; code: string; participationType: string };
  template:    { id: string; name: string; code: string; description: string | null; criterions: Criterion[] };
  scores:      ScoreRow[];
  participants: Participant[];
};

const GENDER_LABEL: Record<string, string> = { MALE: "L", FEMALE: "P" };

// ── Helpers ────────────────────────────────────────────────────────────────────

function totalScore(criterions: Criterion[], pScores: ScoreRow[]): number {
  return criterions.reduce((sum, c) => {
    const s = pScores.find(r => r.criterionId === c.id);
    if (!s || c.type === "TIME") return sum;
    return sum + (s.score ?? 0);
  }, 0);
}

function bestTime(criterions: Criterion[], pScores: ScoreRow[]): number | null {
  for (const c of criterions.filter(x => x.type === "TIME")) {
    const s = pScores.find(r => r.criterionId === c.id);
    if (s?.timeSeconds != null) return s.timeSeconds;
  }
  return null;
}

function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function isScored(criterions: Criterion[], pScores: ScoreRow[]): boolean {
  return criterions.every(c => pScores.some(s => s.criterionId === c.id));
}

// ── ParticipantRow ─────────────────────────────────────────────────────────────

function ParticipantRow({
  participant, idx, criterions, pScores, hasTimeCols, onJudge,
}: {
  participant: Participant; idx: number; criterions: Criterion[]; pScores: ScoreRow[];
  hasTimeCols: boolean; onJudge: () => void;
}) {
  const total  = totalScore(criterions, pScores);
  const time   = bestTime(criterions, pScores);
  const scored = isScored(criterions, pScores);

  return (
    <tr className={cn(
      "border-b transition-colors",
      scored ? "bg-white hover:bg-violet-50/40" : "bg-zinc-50/60 hover:bg-zinc-100/60",
    )}>
      <td className="px-3 py-2.5 text-center">
        <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center mx-auto">
          {idx + 1}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn(
            "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0",
            participant.gender === "MALE" ? "bg-sky-100 text-sky-700" : "bg-pink-100 text-pink-700",
          )}>
            {GENDER_LABEL[participant.gender] ?? "?"}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900 leading-tight truncate">{participant.name}</p>
            <p className="text-xs text-zinc-500 mt-0.5 truncate">
              {participant.contingentShortName ?? participant.contingent}
              {participant.classGrade ? ` · ${participant.classGrade}` : ""}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-center">
        {scored ? (
          <span className="text-sm font-bold text-violet-700">{total.toFixed(1)}</span>
        ) : (
          <span className="text-xs text-zinc-300">—</span>
        )}
      </td>
      {hasTimeCols && (
        <td className="px-3 py-2.5 text-center">
          {time != null ? (
            <span className="text-sm font-mono text-sky-700">{fmtTime(time)}</span>
          ) : (
            <span className="text-xs text-zinc-300">—</span>
          )}
        </td>
      )}
      <td className="px-3 py-2.5 text-right">
        <button
          onClick={onJudge}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            scored ? "bg-sky-50 text-sky-700 hover:bg-sky-100" : "bg-violet-600 text-white hover:bg-violet-700",
          )}
        >
          {scored
            ? <><RefreshCw className="h-3 w-3" /> Kemaskini</>
            : <><ClipboardPen className="h-3 w-3" /> Nilai</>}
        </button>
      </td>
    </tr>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function WalkInJudgingBoardClient({ slug }: { slug: string }) {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error,    setError]    = useState("");
  const [data,     setData]     = useState<BoardData | null>(null);
  const [scores,   setScores]   = useState<ScoreRow[]>([]);

  const storageKey = `walkin_judging_pc_${slug}`;

  useEffect(() => {
    const stored = sessionStorage.getItem(storageKey);
    if (!stored) return;
    Promise.resolve(stored)
      .then(pc => {
        setRestoring(true);
        return fetch(`/api/walkin-judging/${slug}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passcode: pc }),
        });
      })
      .then(r => r.json())
      .then(j => {
        if (!j.error) { setData(j); setScores(j.scores ?? []); }
        else sessionStorage.removeItem(storageKey);
      })
      .catch(() => {})
      .finally(() => setRestoring(false));
  }, [slug, storageKey]);

  async function handleVerify() {
    if (!passcode.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/walkin-judging/${slug}`, {
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
      sessionStorage.setItem(storageKey, passcode.trim().toUpperCase());
      setData(j);
      setScores(j.scores ?? []);
    } finally { setLoading(false); }
  }

  if (restoring) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center">
              <Gavel className="h-8 w-8 text-violet-600" />
            </div>
            <h1 className="text-xl font-bold text-zinc-900">Walk-in Penghakiman</h1>
            <p className="text-sm text-zinc-500">Masukkan passcode yang diberikan untuk meneruskan.</p>
          </div>

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
              className="w-full h-11 bg-violet-600 hover:bg-violet-700 text-white font-semibold"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Masuk
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const criterions  = data.template.criterions;
  const hasTimeCols = criterions.some(c => c.type === "TIME");
  const scoredCount = data.participants.filter(p =>
    isScored(criterions, scores.filter(s => s.walkInRegistrationId === p.id)),
  ).length;

  const sortedParticipants = [...data.participants].sort((a, b) => {
    const aScores = scores.filter(s => s.walkInRegistrationId === a.id);
    const bScores = scores.filter(s => s.walkInRegistrationId === b.id);
    const aScored = isScored(criterions, aScores);
    const bScored = isScored(criterions, bScores);
    if (aScored && !bScored) return -1;
    if (!aScored && bScored) return 1;
    if (aScored && bScored) {
      const aTotal = totalScore(criterions, aScores);
      const bTotal = totalScore(criterions, bScores);
      if (aTotal !== bTotal) return bTotal - aTotal;
      if (hasTimeCols) {
        const aTime = bestTime(criterions, aScores);
        const bTime = bestTime(criterions, bScores);
        if (aTime != null && bTime != null) return aTime - bTime;
      }
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
            <Gavel className="h-5 w-5 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-zinc-900 text-sm leading-tight">{data.event.name}</p>
              <span className="text-[10px] bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-mono">{data.event.scope}</span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
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
            <p className="text-xs text-zinc-500 font-semibold">{scoredCount}/{data.participants.length} dinilai</p>
            <p className="text-[10px] text-zinc-300 mt-0.5">Walk-in</p>
          </div>
        </div>
      </div>

      {/* Participants table */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {data.participants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-3">
            <Users className="h-10 w-10 text-zinc-200" />
            <p className="text-sm">Tiada peserta walk-in yang disahkan untuk pertandingan ini.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-zinc-50 border-b text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  <th className="px-3 py-2.5 text-center w-10">#</th>
                  <th className="px-3 py-2.5">Peserta</th>
                  <th className="px-3 py-2.5 text-center w-20">Markah</th>
                  {hasTimeCols && <th className="px-3 py-2.5 text-center w-24">Masa</th>}
                  <th className="px-3 py-2.5 text-center w-24">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {sortedParticipants.map((p, idx) => (
                  <ParticipantRow
                    key={p.id}
                    participant={p}
                    idx={idx}
                    criterions={criterions}
                    pScores={scores.filter(s => s.walkInRegistrationId === p.id)}
                    hasTimeCols={hasTimeCols}
                    onJudge={() => router.push(`/walkin-judging/${slug}/participant/${p.id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
