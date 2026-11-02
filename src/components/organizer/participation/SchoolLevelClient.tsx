"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { School, Users, Trophy, Info, Loader2, CheckCircle2, Circle, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LevelBreakdown, LevelCompetition, SchoolLevelOverview, SchoolLevelResult } from "@/lib/schoolLevelStats";
import { Breakdowns, StatCard, fmt } from "@/components/organizer/workshops/parts";

// Participation → School Level: competitions by eligibility, school contingents
// only, counted like the dashboard's "Total Participation". Laid out like
// Workshops. The figures load in steps — the level list, then each level's
// eligibility pass — and the steps are shown while they run.

type Step = { key: string; label: string; state: "pending" | "running" | "done" | "error"; detail?: string; ms?: number };
const API = "/api/v2/organizer/participation/school-level";

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Gagal (${r.status})`);
  return j as T;
}

function mergeBreakdowns(list: LevelBreakdown[]): LevelBreakdown {
  const out: LevelBreakdown = { state: [], schoolCategory: [], ethnicity: [], gender: [] };
  for (const dim of Object.keys(out) as (keyof LevelBreakdown)[]) {
    const m = new Map<string, number>();
    for (const b of list) for (const r of b[dim]) m.set(r.label, (m.get(r.label) ?? 0) + r.count);
    out[dim] = [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }
  return out;
}

function Progress({ steps, startedAt }: { steps: Step[]; startedAt: number }) {
  const done = steps.filter((s) => s.state === "done").length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const [now, setNow] = useState(() => Date.now());
  const running = steps.some((s) => s.state === "running" || s.state === "pending");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [running]);

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-semibold text-zinc-700">
          {running ? "Memproses penyertaan mengikut kelayakan…" : "Pemprosesan selesai"}
        </span>
        <span className="tabular-nums text-zinc-400">{pct}% · {((now - startedAt) / 1000).toFixed(1)} s</span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full rounded-full bg-[#085782] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <ol className="space-y-1.5">
        {steps.map((s) => (
          <li key={s.key} className="flex items-center gap-2.5 text-xs">
            {s.state === "done" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              : s.state === "running" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#085782]" />
              : s.state === "error" ? <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
              : <Circle className="h-4 w-4 shrink-0 text-zinc-300" />}
            <span className={cn(s.state === "pending" ? "text-zinc-400" : "text-zinc-700", s.state === "running" && "font-medium")}>{s.label}</span>
            {s.detail && <span className={cn("text-zinc-400", s.state === "error" && "text-red-600")}>— {s.detail}</span>}
            {s.ms != null && <span className="ml-auto tabular-nums text-zinc-400">{s.ms} ms</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function SchoolLevelClient() {
  const [overview, setOverview] = useState<SchoolLevelOverview | null>(null);
  const [results, setResults]   = useState<Record<string, SchoolLevelResult>>({});
  const [steps, setSteps]       = useState<Step[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const [level, setLevel]       = useState<string>("ALL");
  const run = useRef(0);

  const setStep = (key: string, patch: Partial<Step>) =>
    setSteps((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const load = useCallback(async () => {
    const id = ++run.current;
    setOverview(null); setResults({}); setStartedAt(Date.now());
    setSteps([{ key: "overview", label: "Membaca peringkat sekolah dan pertandingan", state: "running" }]);
    try {
      const t0 = Date.now();
      const ov = await getJson<SchoolLevelOverview>(API);
      if (id !== run.current) return;
      setOverview(ov);
      setSteps([
        { key: "overview", label: "Membaca peringkat sekolah dan pertandingan", state: "done", ms: Date.now() - t0,
          detail: `${ov.levels.length} peringkat · ${fmt(ov.schools)} sekolah` },
        ...ov.levels.map((l): Step => ({
          key: l.level, label: `${l.label}: menyemak kelayakan ${fmt(l.participants)} peserta × ${l.competitions} pertandingan`, state: "pending",
        })),
      ]);
      // One level at a time, so each finished level shows straight away
      for (const l of ov.levels) {
        if (id !== run.current) return;
        setStep(l.level, { state: "running" });
        try {
          const t1 = Date.now();
          const r = await getJson<SchoolLevelResult>(`${API}?level=${encodeURIComponent(l.level)}`);
          if (id !== run.current) return;
          setResults((prev) => ({ ...prev, [l.level]: r }));
          setStep(l.level, { state: "done", ms: Date.now() - t1, detail: `${fmt(r.participations)} penyertaan` });
        } catch (e) {
          setStep(l.level, { state: "error", detail: e instanceof Error ? e.message : "Gagal" });
        }
      }
    } catch (e) {
      if (id === run.current) setStep("overview", { state: "error", detail: e instanceof Error ? e.message : "Gagal" });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the stepwise load on mount
    load();
  }, [load]);

  const loaded = overview ? overview.levels.map((l) => results[l.level]).filter((r): r is SchoolLevelResult => !!r) : [];
  const allDone = !!overview && loaded.length === overview.levels.length;
  const active = level === "ALL" ? null : results[level] ?? null;
  const totals = active ?? {
    schools: allDone ? overview!.schools : loaded.reduce((s, r) => s + r.schools, 0),
    participations: loaded.reduce((s, r) => s + r.participations, 0),
    male: loaded.reduce((s, r) => s + r.male, 0),
    female: loaded.reduce((s, r) => s + r.female, 0),
    breakdown: mergeBreakdowns(loaded.map((r) => r.breakdown)),
  };
  const competitions = active
    ? active.competitions
    : loaded.flatMap((r) => r.competitions).sort((a, b) => a.code.localeCompare(b.code));
  const processing = steps.some((s) => s.state === "running" || s.state === "pending");

  // Table grouped by target group (a competition with two groups is listed under each)
  const byGroup = new Map<string, { name: string; rows: LevelCompetition[] }>();
  for (const c of competitions) {
    for (const t of c.targetGroups.length ? c.targetGroups : [{ id: "-", name: "Tiada kumpulan sasaran" }]) {
      const g = byGroup.get(t.id) ?? { name: t.name, rows: [] };
      g.rows.push(c);
      byGroup.set(t.id, g);
    }
  }
  const groups = [...byGroup.entries()]
    .map(([id, g]) => ({ id, ...g, participations: g.rows.reduce((s, c) => s + c.participations, 0) }))
    .sort((a, b) => a.name.localeCompare(b.name, "ms", { numeric: true }));

  return (
    <div className="mx-auto max-w-6xl space-y-7 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">School Level</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Competitions by eligibility — grouped by the school level of their target groups.
          </p>
        </div>
        <button onClick={load} disabled={processing}
          className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
          {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Muat semula
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs text-sky-800">
        <Info className="mt-px h-4 w-4 shrink-0" />
        <p>
          This section is based on <b>school contingents</b> only. Participations are counted the same way as
          <b> Total Participation</b> on the dashboard: for every competition, each participant whose education level
          matches one of its target groups (PPKI-only groups: PPKI participants) is one participation — whether or not
          they have joined a team. Higher-institution, independent and international contingents are not counted.
        </p>
      </div>

      {(processing || steps.some((s) => s.state === "error")) && <Progress steps={steps} startedAt={startedAt} />}

      {overview && (
        <div className="flex flex-wrap gap-1.5">
          {[{ level: "ALL", label: "All levels" }, ...overview.levels].map((l) => {
            const r = l.level === "ALL" ? null : results[l.level];
            const count = l.level === "ALL" ? loaded.reduce((s, x) => s + x.participations, 0) : r?.participations;
            const ready = l.level === "ALL" ? loaded.length > 0 : !!r;
            return (
              <button key={l.level} onClick={() => setLevel(l.level)} disabled={!ready}
                className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                  level === l.level ? "border-[#085782] bg-[#085782] text-white" : "bg-white text-zinc-600 hover:bg-zinc-50")}>
                {l.label}
                <span className={cn("ml-1.5 tabular-nums", level === l.level ? "text-white/70" : "text-zinc-400")}>
                  {ready ? fmt(count ?? 0) : "…"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {loaded.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Competitions" value={competitions.length} icon={Trophy} color="bg-[#085782]" sub="eligible to school participants" />
            <StatCard label="Schools" value={totals.schools} icon={School} color="bg-violet-500" sub="school contingents with eligible participants" />
            <StatCard label="Participations" value={totals.participations} icon={Users} color="bg-sky-500" sub="as Total Participation on the dashboard" />
            <StatCard label="Male / Female" value={`${fmt(totals.male)} / ${fmt(totals.female)}`} icon={Users} color="bg-emerald-500"
              sub={totals.participations ? `${((totals.female / totals.participations) * 100).toFixed(1)}% female` : undefined} />
          </div>

          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-zinc-50/80 text-left text-xs font-semibold text-zinc-600">
                  <tr>
                    <th className="px-4 py-3">Competition</th>
                    <th className="px-4 py-3 text-right">Schools</th>
                    <th className="px-4 py-3 text-right">Participations</th>
                    <th className="px-4 py-3 text-right">Male</th>
                    <th className="px-4 py-3 text-right">Female</th>
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.id} className="divide-y border-b last:border-b-0">
                    <tr className="bg-zinc-50/70">
                      <td colSpan={5} className="px-4 py-2 text-xs font-semibold text-zinc-700">
                        {g.name}
                        <span className="ml-2 font-normal text-zinc-400">
                          {g.rows.length} pertandingan · {fmt(g.participations)} penyertaan
                        </span>
                      </td>
                    </tr>
                    {g.rows.map((c) => (
                      <tr key={`${g.id}:${c.id}`} className={cn("group hover:bg-sky-50/60", c.participations === 0 && "text-zinc-400")}>
                        <td className="px-4 py-2.5 pl-7">
                          <Link href={`/organizer/participation/school-level/${c.id}`}
                            className={cn("hover:text-[#085782] hover:underline", c.participations ? "text-zinc-900" : "")}>
                            <span className="mr-1.5 font-mono text-xs text-zinc-400">{c.code}</span>
                            {c.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(c.schools)}</td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums">{fmt(c.participations)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(c.male)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(c.female)}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold text-zinc-900">
              Participations — {active ? overview?.levels.find((l) => l.level === level)?.label : "all levels"}
            </h2>
            <p className="text-xs text-zinc-500">
              {fmt(totals.participations)} participations from school contingents
              {level === "ALL" && !allDone && " (levels still processing)"}.
            </p>
          </div>

          <Breakdowns breakdown={totals.breakdown} total={totals.participations}
            dimensions={["state", "schoolCategory", "ethnicity", "gender"]} />
        </>
      )}
    </div>
  );
}
