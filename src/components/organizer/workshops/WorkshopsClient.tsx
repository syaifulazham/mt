import Link from "next/link";
import { GraduationCap, Users, UsersRound, BookCheck, AlertTriangle, ChevronRight } from "lucide-react";
import type { WorkshopStats } from "@/lib/workshopStats";
import { Breakdowns, StatCard, StatusBadge, fmt, type CourseMeta } from "./parts";

export function WorkshopsClient({ stats, courses, lmsError }: {
  stats: WorkshopStats;
  courses: Record<string, CourseMeta>;
  lmsError: string | null;
}) {
  const workshops = [...stats.workshops].sort((a, b) => b.participants - a.participants);

  const teams = workshops.reduce((s, w) => s + w.competitions.reduce((t, c) => t + c.teams, 0), 0);
  const teamsLms = workshops.reduce((s, w) => s + w.competitions.reduce((t, c) => t + c.teamsLmsEnrolled, 0), 0);
  const lmsEnrolments = workshops.reduce((s, w) => s + (courses[w.courseId]?.enrolmentCount ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-7 p-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Workshops</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          EptimEdu courses attached to competitions. Participants are the members of teams registered
          for each course&apos;s competition.
        </p>
      </div>

      {lmsError && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Couldn&apos;t load course details from EptimEdu ({lmsError}). Participant stats below are unaffected.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Workshops" value={workshops.length} icon={GraduationCap} color="bg-[#085782]" sub="courses linked to competitions" />
        <StatCard label="Registered Participants" value={stats.totalParticipants} icon={Users} color="bg-sky-500" sub="unique, across all workshops" />
        <StatCard label="Teams" value={teams} icon={UsersRound} color="bg-violet-500" sub={`${fmt(teamsLms)} enrolled in the course`} />
        <StatCard label="LMS Enrolments" value={lmsError ? "—" : lmsEnrolments} icon={BookCheck} color="bg-emerald-500" sub="reported by EptimEdu" />
      </div>

      {/* Workshop list — each row opens the workshop's own page */}
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-zinc-50/80 text-left text-xs font-semibold text-zinc-600">
              <tr>
                <th className="px-4 py-3">Workshop</th>
                <th className="px-4 py-3">Competition</th>
                <th className="px-4 py-3 text-right">Participants</th>
                <th className="px-4 py-3 text-right">Teams</th>
                <th className="px-4 py-3 text-right">Teams enrolled</th>
                <th className="px-4 py-3 text-right">LMS enrolments</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {workshops.map((w) => {
                const meta = courses[w.courseId];
                const href = `/organizer/workshops/${encodeURIComponent(w.courseId)}`;
                const wTeams = w.competitions.reduce((t, c) => t + c.teams, 0);
                const wLms = w.competitions.reduce((t, c) => t + c.teamsLmsEnrolled, 0);
                return (
                  <tr key={w.courseId} className="group relative hover:bg-sky-50/60">
                    <td className="px-4 py-2.5">
                      {/* The title link stretches over the whole row */}
                      <Link href={href} className="font-medium text-zinc-900 after:absolute after:inset-0 group-hover:text-[#085782]">
                        {meta?.title ?? w.title}
                      </Link>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-400">
                        {meta && <StatusBadge status={meta.status} />}
                        {!meta && !lmsError && <span className="text-amber-600">Not found in EptimEdu</span>}
                        {meta?.instructor && <span>{meta.instructor}</span>}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-600">
                      {w.competitions.map((c) => (
                        <div key={c.id}><span className="font-mono text-zinc-400">{c.code}</span> {c.name}</div>
                      ))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{fmt(w.participants)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(wTeams)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(wLms)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {meta?.enrolmentCount != null ? fmt(meta.enrolmentCount) : "—"}
                    </td>
                    <td className="pr-3 text-zinc-300 group-hover:text-[#085782]">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-900">Registered participants — all workshops</h2>
        <p className="text-xs text-zinc-500">
          {fmt(stats.totalParticipants)} unique participants. Open a workshop for its own breakdown and participant list.
        </p>
      </div>

      <Breakdowns breakdown={stats.overall} total={stats.totalParticipants} />
    </div>
  );
}
