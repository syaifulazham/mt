"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Trophy } from "lucide-react";
import { TeamAvatar, preferFor } from "@/components/duel/TeamAvatar";
import { cn } from "@/lib/utils";
import type { CompetitionResult, RankingEntry } from "@/lib/resultsRankings";
import { compareScoreTime, withSharedRanks } from "@/lib/sharedRank";
import { TeamCertCell, useTeamCertCounts } from "@/components/organizer/scoreboard/TeamCertCell";

const POLL_MS = 5_000;
const fmtTime = (s: number | null) => s == null ? "—" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Live ranking of a score-judged competition from every judging task's scores. */
export function ScoreRankingClient({ event, ecId, competition }: {
  event: { id: string; name: string; slug: string }; ecId: string; competition: { name: string; code: string };
}) {
  const [result, setResult] = useState<CompetitionResult | null | undefined>(undefined);
  const certCounts = useTeamCertCounts(event.id, ecId);

  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch(`/api/v2/organizer/events/${event.id}/competitions/${ecId}/ranking`, { cache: "no-store" });
        if (res.ok && !stop) setResult((await res.json()).result);
      } catch { /* keep the last good ranking */ }
      if (!stop) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [event.id, ecId]);

  const rows = result ? [...result.rankings, ...result.foreignRankings] : [];
  const hasTime = rows.some(r => r.bestTime != null);
  const byState = result?.resultScope === "STATE";
  // Negeri: one table per state, ranked within it (foreign teams keep their own table).
  const groups: { key: string; name: string | null; flag: string | null; rows: RankingEntry[] }[] = !result ? [] : byState
    ? [
        ...[...new Map(result.rankings.map(r => [r.stateId ?? "", { name: r.stateName ?? "Tiada negeri", flag: r.stateFlag }])).entries()]
          .sort(([a, x], [b, y]) => (a === "" ? 1 : b === "" ? -1 : x.name.localeCompare(y.name)))
          .map(([key, v]) => ({
            key, name: v.name, flag: v.flag,
            rows: withSharedRanks(result.rankings.filter(r => (r.stateId ?? "") === key), compareScoreTime, result.rankMode),
          })),
        ...(result.foreignRankings.length ? [{ key: "__intl", name: "Antarabangsa", flag: null, rows: result.foreignRankings }] : []),
      ]
    : [{ key: "", name: null, flag: null, rows }];

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <div className="flex items-start gap-4">
        <Link href={`/organizer/events/${event.slug}/manage/scoreboard`} className="mt-1 flex shrink-0 items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700">
          <ArrowLeft className="h-3.5 w-3.5" /> Scoreboard
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-zinc-900"><span className="mr-2 font-mono text-zinc-400">{competition.code}</span>{competition.name}</h1>
          <p className="text-sm text-zinc-500">{event.name} · {byState ? "kedudukan mengikut negeri" : "kedudukan kebangsaan"} · langsung daripada markah penghakiman (dikemas kini setiap {POLL_MS / 1000} saat)</p>
        </div>
      </div>

      {result === undefined ? (
        <p className="text-sm text-zinc-400"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Memuatkan…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-zinc-400">Belum ada markah.</p>
      ) : (
        groups.map(g => (
        <div key={g.key} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          {g.name && (
            <div className="flex items-center gap-2 border-b bg-zinc-50 px-4 py-2.5 text-sm font-semibold text-zinc-700">
              {g.flag && <TeamAvatar flagUrl={g.flag} logoUrl={null} name={g.name} className="h-5 w-5" prefer="flag" />}
              {g.name}
              <span className="text-xs font-normal text-zinc-400">{g.rows.length} pasukan</span>
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="w-16 px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">Pasukan</th>
                <th className="px-4 py-2 text-left">Kontinjen</th>
                <th className="w-24 px-4 py-2 text-right">Markah</th>
                {hasTime && <th className="w-20 px-4 py-2 text-right">Masa</th>}
                <th className="w-20 px-4 py-2 text-center">Sijil</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {g.rows.map(r => (
                <tr key={r.teamId} className={cn(r.rank <= 3 && !r.countryCode && "bg-amber-50/40")}>
                  <td className="px-4 py-2.5">
                    <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                      r.rank === 1 ? "bg-amber-400 text-white" : r.rank === 2 ? "bg-zinc-300 text-white" : r.rank === 3 ? "bg-orange-300 text-white" : "bg-zinc-100 text-zinc-500")}>
                      {r.rank <= 3 ? <Trophy className="h-3.5 w-3.5" /> : r.rank}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-zinc-800">{r.teamName}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2 text-zinc-600">
                      <TeamAvatar flagUrl={r.stateFlag} logoUrl={r.contingentLogo} name={r.contingentName} className="h-6 w-6" prefer={preferFor(result?.resultScope)} />
                      <span className="truncate">{r.contingentShortName || r.contingentName}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{Number(r.totalScore.toFixed(2))}</td>
                  {hasTime && <td className="px-4 py-2.5 text-right font-mono text-zinc-500">{fmtTime(r.bestTime)}</td>}
                  <td className="px-4 py-2.5 text-center">
                    <TeamCertCell eventSlug={event.slug} ecId={ecId} teamId={r.teamId} count={certCounts[r.teamId]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        ))
      )}
    </div>
  );
}
