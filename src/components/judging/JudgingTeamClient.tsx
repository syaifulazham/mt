"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Gavel, Loader2, Timer, Star,
  CheckSquare, Square, Trophy, Tag, Users, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ── Types (mirrored from JudgingBoardClient) ───────────────────────────────────

type Member  = { name: string; gender: string; eduLevel: string; age: number | null; classGrade: string | null; className: string | null };
type COption = { id: string; label: string; weight: number; order: number };
type Criterion = {
  id: string; name: string; order: number; type: string;
  maxScore: number | null; minScore: number | null; maxTime: number | null;
  options: COption[];
};
type Team = {
  id: string; name: string; contingent: string; contingentType: string;
  memberCount: number; members: Member[];
};
type ScoreRow = {
  id: string; judgingTaskId: string; teamId: string; criterionId: string;
  score: number | null; timeSeconds: number | null; optionIds: string[];
};
type BoardData = {
  task:        { id: string; label: string | null; status: string };
  event:       { id: string; name: string; scope: string };
  competition: { id: string; name: string; code: string };
  template:    { id: string; name: string; code: string; criterions: Criterion[] };
  scores:      ScoreRow[];
  isOnline:    boolean;
  teams:       Team[];
};

type DraftScore = {
  score: number | string;
  timeMinutes: number | string;
  timeSeconds: number | string;
  optionIds: string[];
};

const EDU_LABEL: Record<string, string> = {
  PRIMARY: "Rendah", SECONDARY: "Menengah", YOUTH: "Belia", KINDERGARTEN: "Tadika",
};

// ── Criterion input ────────────────────────────────────────────────────────────

function CriterionInput({
  criterion, draft, onChange,
}: {
  criterion: Criterion;
  draft: DraftScore;
  onChange: (field: keyof DraftScore, value: unknown) => void;
}) {
  function toggleOption(optionId: string) {
    const current = draft.optionIds;
    if (criterion.type === "MULTIPLE_OPTION") {
      onChange("optionIds", current.includes(optionId)
        ? current.filter(x => x !== optionId)
        : [...current, optionId]);
    } else {
      onChange("optionIds", [optionId]);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-3">
      {/* Criterion header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-zinc-900">{criterion.name}</p>
          {criterion.type === "NUMBER" && criterion.maxScore != null && (
            <p className="text-xs text-zinc-400 mt-0.5">Skor: {criterion.minScore ?? 0} – {criterion.maxScore}</p>
          )}
          {criterion.type === "TIME" && criterion.maxTime != null && (
            <p className="text-xs text-zinc-400 mt-0.5">Masa maks: {fmtMaxTime(criterion.maxTime)}</p>
          )}
        </div>
        <span className={cn(
          "text-[10px] px-2 py-1 rounded-full font-mono font-semibold shrink-0",
          criterion.type === "TIME"            ? "bg-sky-100 text-sky-700" :
          criterion.type === "NUMBER"          ? "bg-green-100 text-green-700" :
          criterion.type === "MULTIPLE_OPTION" ? "bg-orange-100 text-orange-700" :
          "bg-violet-100 text-violet-700"
        )}>
          {criterion.type === "TIME" ? "MASA" :
           criterion.type === "NUMBER" ? "NOMBOR" :
           criterion.type === "MULTIPLE_OPTION" ? "MULTI" : "PILIHAN"}
        </span>
      </div>

      {/* NUMBER: score display + slider only */}
      {criterion.type === "NUMBER" && (() => {
        const min = criterion.minScore ?? 0;
        const max = criterion.maxScore ?? 100;
        const val = draft.score === "" ? min : Number(draft.score);
        const pct = Math.min(100, Math.max(0, (val - min) / (max - min) * 100));
        return (
          <div className="space-y-4">
            <div className="flex items-end gap-3">
              <Input
                type="number"
                value={draft.score}
                min={min}
                max={max}
                onChange={e => onChange("score", e.target.value)}
                className="w-28 h-14 text-3xl font-black text-center pr-0"
                placeholder={String(min)}
              />
              <span className="pb-2 text-sm font-medium text-zinc-400">/ {max}</span>
            </div>
            <div>
              <input
                type="range"
                min={min}
                max={max}
                step={1}
                value={val}
                onChange={e => onChange("score", e.target.value)}
                className="w-full h-2 appearance-none rounded-full cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #4ade80 ${pct}%, #e4e4e7 ${pct}%)`,
                }}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-zinc-400">{min}</span>
                {min !== max && (
                  <span className="text-[10px] text-zinc-400">{Math.round((min + max) / 2)}</span>
                )}
                <span className="text-[10px] text-zinc-400">{max}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* TIME input */}
      {criterion.type === "TIME" && (
        <div className="flex items-center gap-3">
          <Timer className="h-5 w-5 text-sky-500 shrink-0" />
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <Input
                type="number"
                value={draft.timeMinutes}
                min={0}
                onChange={e => onChange("timeMinutes", e.target.value)}
                className="w-20 h-11 text-xl font-bold text-center"
                placeholder="0"
              />
              <span className="text-xs text-zinc-400">minit</span>
            </div>
            <span className="text-2xl font-bold text-zinc-300 pb-5">:</span>
            <div className="flex flex-col items-center gap-1">
              <Input
                type="number"
                value={draft.timeSeconds}
                min={0}
                max={59}
                onChange={e => onChange("timeSeconds", e.target.value)}
                className="w-20 h-11 text-xl font-bold text-center"
                placeholder="00"
              />
              <span className="text-xs text-zinc-400">saat</span>
            </div>
          </div>
        </div>
      )}

      {/* SINGLE_OPTION / MULTIPLE_OPTION — 2-column grid */}
      {(criterion.type === "SINGLE_OPTION" || criterion.type === "MULTIPLE_OPTION") && (
        <div className="grid grid-cols-2 gap-2">
          {criterion.options.map(o => {
            const selected = draft.optionIds.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggleOption(o.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all w-full",
                  selected
                    ? "bg-violet-600 border-violet-600 text-white shadow-md"
                    : "bg-white border-zinc-200 text-zinc-600 hover:border-violet-300 hover:bg-violet-50"
                )}
              >
                {criterion.type === "MULTIPLE_OPTION"
                  ? (selected ? <CheckSquare className="h-4 w-4 shrink-0" /> : <Square className="h-4 w-4 shrink-0" />)
                  : <Star className={cn("h-4 w-4 shrink-0", selected ? "fill-white" : "")} />
                }
                <span className="flex-1 text-left truncate">{o.label}</span>
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full font-mono shrink-0",
                  selected ? "bg-violet-500 text-violet-100" : "bg-zinc-100 text-zinc-500"
                )}>
                  {o.weight}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Live score preview for option types */}
      {(criterion.type === "SINGLE_OPTION" || criterion.type === "MULTIPLE_OPTION") && (
        <div className="pt-1 border-t text-right">
          <span className="text-xs text-zinc-400">Markah terpilih: </span>
          <span className="text-sm font-bold text-violet-700">
            {criterion.options.filter(o => draft.optionIds.includes(o.id)).reduce((s, o) => s + o.weight, 0)}
          </span>
        </div>
      )}
    </div>
  );
}

function fmtMaxTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function JudgingTeamClient({ slug, teamId }: { slug: string; teamId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [data, setData] = useState<BoardData | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [draft, setDraft] = useState<Record<string, DraftScore>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const pc = sessionStorage.getItem(`judging_pc_${slug}`);
    if (!pc) {
      router.replace(`/judging/${slug}`);
      return;
    }

    fetch(`/api/judging/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: pc }),
    })
      .then(r => r.json())
      .then((j: BoardData & { error?: string }) => {
        if (j.error) { setErrorMsg("Sesi tamat. Sila log masuk semula."); setStatus("error"); return; }
        const t = j.teams.find(x => x.id === teamId);
        if (!t) { setErrorMsg("Pasukan tidak dijumpai."); setStatus("error"); return; }
        setData(j);
        setTeam(t);

        // Initialise draft from existing scores
        const d: Record<string, DraftScore> = {};
        for (const c of j.template.criterions) {
          const existing = j.scores.find(s => s.criterionId === c.id && s.teamId === teamId);
          let timeMinutes = "";
          let timeSecs = "";
          if (existing?.timeSeconds != null) {
            timeMinutes = String(Math.floor(existing.timeSeconds / 60));
            timeSecs = String(existing.timeSeconds % 60);
          }
          d[c.id] = {
            score: existing?.score ?? "",
            timeMinutes,
            timeSeconds: timeSecs,
            optionIds: existing?.optionIds ?? [],
          };
        }
        setDraft(d);
        setStatus("ready");
      })
      .catch(() => { setErrorMsg("Ralat rangkaian."); setStatus("error"); });
  }, [slug, teamId, router]);

  function setField(criterionId: string, field: keyof DraftScore, value: unknown) {
    setDraft(d => ({ ...d, [criterionId]: { ...d[criterionId], [field]: value } }));
    setSaved(false);
  }

  async function handleSave() {
    if (!data || !team) return;
    const pc = sessionStorage.getItem(`judging_pc_${slug}`) ?? "";
    setSaving(true); setSaveError(""); setSaved(false);
    try {
      for (const c of data.template.criterions) {
        const d = draft[c.id];
        if (!d) continue;

        let score: number | null = null;
        let timeSeconds: number | null = null;
        let optionIds: string[] = [];

        if (c.type === "NUMBER") {
          score = d.score === "" ? null : Number(d.score);
        } else if (c.type === "TIME") {
          const m = d.timeMinutes === "" ? 0 : Number(d.timeMinutes);
          const s = d.timeSeconds === "" ? 0 : Number(d.timeSeconds);
          timeSeconds = m * 60 + s || null;
        } else {
          optionIds = d.optionIds;
          score = c.options.filter(o => optionIds.includes(o.id)).reduce((s, o) => s + o.weight, 0);
        }

        const res = await fetch(`/api/judging/${slug}/scores`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passcode: pc, teamId: team.id, criterionId: c.id, score, timeSeconds, optionIds }),
        });
        if (!res.ok) { setSaveError("Gagal menyimpan markah."); return; }
      }
      setSaved(true);
    } finally { setSaving(false); }
  }

  async function handleSaveAndBack() {
    await handleSave();
    router.push(`/judging/${slug}`);
  }

  // ── Loading ──
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
      </div>
    );
  }

  // ── Error ──
  if (status === "error" || !data || !team) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-sm text-red-500">{errorMsg}</p>
        <Button variant="outline" size="sm" onClick={() => router.replace(`/judging/${slug}`)}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Kembali
        </Button>
      </div>
    );
  }

  const criterions = data.template.criterions;
  const totalScore = criterions.reduce((sum, c) => {
    const d = draft[c.id];
    if (!d || c.type === "TIME") return sum;
    if (c.type === "NUMBER") return sum + (d.score === "" ? 0 : Number(d.score));
    return sum + c.options.filter(o => d.optionIds.includes(o.id)).reduce((s, o) => s + o.weight, 0);
  }, 0);

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Sticky header */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push(`/judging/${slug}`)}
            className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <Gavel className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-zinc-900 text-sm leading-tight truncate">{team.name}</p>
            <p className="text-xs text-zinc-500 truncate">{team.contingent}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-zinc-400">Jumlah</p>
            <p className="text-lg font-black text-violet-700 leading-tight">{totalScore.toFixed(1)}</p>
          </div>
        </div>
      </div>

      {/* Event / Competition / Template info bar */}
      <div className="bg-zinc-50 border-b">
        <div className="max-w-2xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-xs text-zinc-500 flex items-center gap-1">
            <Trophy className="h-3 w-3 text-amber-400" />{data.competition.name}
          </span>
          <span className="text-xs text-zinc-500 flex items-center gap-1">
            <Tag className="h-3 w-3 text-violet-400" />{data.template.name}
          </span>
          {data.task.label && (
            <span className="text-xs font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded">
              {data.task.label}
            </span>
          )}
          <span className="text-[10px] text-zinc-400 font-mono">{data.event.scope}</span>
        </div>
      </div>

      {/* Member list */}
      {team.members.length > 0 && (
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Ahli Pasukan</span>
          </div>
          <div className="rounded-lg border overflow-hidden bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-50 border-b">
                  <th className="px-3 py-2 text-left font-medium text-zinc-500">Nama</th>
                  <th className="px-3 py-2 text-center font-medium text-zinc-500 w-16">Umur</th>
                  <th className="px-3 py-2 text-center font-medium text-zinc-500 w-20">Jantina</th>
                  <th className="px-3 py-2 text-center font-medium text-zinc-500 w-32">Kelas</th>
                </tr>
              </thead>
              <tbody>
                {team.members.map((m, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-zinc-50/60">
                    <td className="px-3 py-2 font-medium text-zinc-800">{m.name}</td>
                    <td className="px-3 py-2 text-center text-zinc-500">{m.age ?? "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                        m.gender === "MALE" ? "bg-sky-100 text-sky-700" : "bg-pink-100 text-pink-700"
                      )}>
                        {m.gender === "MALE" ? "Lelaki" : "Perempuan"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-zinc-500">
                      {m.classGrade ?? "—"}
                      {m.className && <span className="ml-1 text-zinc-400">· {m.className}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Criterions */}
      <div className="max-w-2xl mx-auto px-4 pb-32 space-y-4">
        {criterions.map((c, i) => (
          <div key={c.id}>
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-1 mb-1.5">
              Kriteria {i + 1}
            </p>
            <CriterionInput
              criterion={c}
              draft={draft[c.id] ?? { score: "", timeMinutes: "", timeSeconds: "", optionIds: [] }}
              onChange={(field, value) => setField(c.id, field, value)}
            />
          </div>
        ))}
      </div>

      {/* Fixed bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-zinc-400">Jumlah markah</p>
            <p className="text-2xl font-black text-violet-700 leading-tight">{totalScore.toFixed(1)}</p>
          </div>
          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
          {saved && !saveError && (
            <p className="text-xs text-green-600 font-medium">Tersimpan ✓</p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="hidden sm:flex"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span className="ml-1.5">Simpan</span>
          </Button>
          <Button
            onClick={handleSaveAndBack}
            disabled={saving}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Simpan &amp; Kembali
          </Button>
        </div>
      </div>
    </div>
  );
}
