import Link from "next/link";
import { ArrowLeft, Users, UsersRound, BookCheck, Clock, AlertTriangle } from "lucide-react";
import type { WorkshopRow } from "@/lib/workshopStats";
import { Breakdowns, StatCard, StatusBadge, fmt, type CourseMeta } from "./parts";
import { DownloadParticipantsButton } from "./DownloadParticipantsButton";

export function WorkshopDetail({ workshop, course, lmsError, canDownload }: {
  workshop: WorkshopRow;
  course: CourseMeta | null;
  lmsError: string | null;
  canDownload: boolean;
}) {
  const title = course?.title ?? workshop.title;
  const teams = workshop.competitions.reduce((s, c) => s + c.teams, 0);
  const teamsLms = workshop.competitions.reduce((s, c) => s + c.teamsLmsEnrolled, 0);
  const hours = course?.totalMinutes ? `${Math.round((course.totalMinutes / 60) * 10) / 10} h` : "—";

  return (
    <div className="mx-auto max-w-6xl space-y-7 p-6">
      <div>
        <Link href="/organizer/workshops" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="h-3.5 w-3.5" /> All workshops
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-zinc-900">{title}</h1>
            {course?.subtitle && <p className="mt-1 text-sm text-zinc-500">{course.subtitle}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
              {course && <StatusBadge status={course.status} />}
              {course?.instructor && <span>Instructor: {course.instructor}</span>}
              <span className="font-mono text-zinc-400">{workshop.courseId}</span>
            </div>
          </div>
          {canDownload && (
            <DownloadParticipantsButton
              courseId={workshop.courseId}
              title={title}
              competitions={workshop.competitions.map((c) => `${c.code} ${c.name}`).join(", ")}
              disabled={workshop.participants === 0}
            />
          )}
        </div>
      </div>

      {lmsError && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Couldn&apos;t load course details from EptimEdu ({lmsError}). Participant stats below are unaffected.
        </div>
      )}
      {!lmsError && !course && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          This course wasn&apos;t found in EptimEdu — it may have been removed from the organisation.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Registered Participants" value={workshop.participants} icon={Users} color="bg-[#085782]" sub="members of registered teams" />
        <StatCard label="Teams" value={teams} icon={UsersRound} color="bg-violet-500" sub={`${fmt(teamsLms)} enrolled in the course`} />
        <StatCard label="LMS Enrolments" value={course?.enrolmentCount ?? "—"} icon={BookCheck} color="bg-emerald-500" sub="reported by EptimEdu" />
        <StatCard label="Course Length" value={hours} icon={Clock} color="bg-sky-500" sub="total lesson time" />
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b bg-zinc-50/80 px-5 py-3.5">
          <h3 className="text-sm font-semibold text-zinc-700">Associated competition{workshop.competitions.length > 1 ? "s" : ""}</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs font-semibold text-zinc-500">
            <tr>
              <th className="px-5 py-2.5">Code</th>
              <th className="px-5 py-2.5">Competition</th>
              <th className="px-5 py-2.5 text-right">Teams</th>
              <th className="px-5 py-2.5 text-right">Teams enrolled</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {workshop.competitions.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-2.5 font-mono text-xs text-zinc-500">{c.code}</td>
                <td className="px-5 py-2.5 text-zinc-800">{c.name}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{fmt(c.teams)}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">
                  {fmt(c.teamsLmsEnrolled)}
                  <span className="ml-1 text-xs text-zinc-400">
                    ({c.teams ? Math.round((c.teamsLmsEnrolled / c.teams) * 100) : 0}%)
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-900">Registered participants</h2>
        <p className="text-xs text-zinc-500">{fmt(workshop.participants)} participants.</p>
      </div>

      <Breakdowns breakdown={workshop.breakdown} total={workshop.participants} />
    </div>
  );
}
