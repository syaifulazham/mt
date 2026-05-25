import { redirect } from "next/navigation";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import type { Metadata } from "next";
import { Trophy, MapPin, Calendar, Users, User, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "Pertandingan" };

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("ms-MY", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateRange(start: Date | null, end: Date | null): string {
  if (start && end) return `${fmtDate(start)} – ${fmtDate(end)}`;
  return fmtDate(start ?? end);
}

export default async function CompetitionsPage() {
  const session = await getParticipantSession();
  if (!session) redirect("/participant/sign-in");

  // Load participant's eduLevel and ppki flag
  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: { eduLevel: true, ppki: true },
  });
  if (!participant) redirect("/participant/sign-in");

  // Competitions the participant is already enrolled in (via teams)
  const memberships = await db.teamMember.findMany({
    where: { participantId: session.participantId },
    select: { team: { select: { competitionId: true } } },
  });
  const enrolledIds = new Set(memberships.map((m) => m.team.competitionId));

  // All competitions that have at least one target group matching the participant's
  // eduLevel. If the participant is NOT ppki, exclude target-group slots that are
  // ppki-only (a competition only shows for non-ppki participants if it has at
  // least one non-ppki target group for their level).
  const competitions = await db.competition.findMany({
    where: {
      targetGroups: {
        some: {
          targetGroup: {
            schoolLevel: participant.eduLevel,
            // ppki competitions visible only to ppki participants
            ...(participant.ppki ? {} : { ppki: false }),
          },
        },
      },
    },
    include: {
      theme: { select: { name: true, color: true } },
      targetGroups: {
        include: { targetGroup: { select: { ppki: true, schoolLevel: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-2xl space-y-5">
      {/* Page heading */}
      <div>
        <h1 className="text-xl font-bold dark:text-zinc-100">Pertandingan</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Senarai pertandingan yang layak untuk anda sertai
        </p>
      </div>

      {/* Empty state */}
      {competitions.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 py-16 px-6 text-center">
          <div className="rounded-full bg-zinc-100 dark:bg-zinc-800 p-4">
            <Trophy className="h-8 w-8 text-zinc-400 dark:text-zinc-500" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-medium dark:text-zinc-200">Tiada pertandingan</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Tiada pertandingan yang sepadan dengan profil anda buat masa ini.
            </p>
          </div>
        </div>
      )}

      {/* Competition cards */}
      {competitions.map((comp) => {
        const themeColor = comp.theme?.color ?? "#085782";
        const isTeam     = comp.participationType === "TEAM";
        const enrolled   = enrolledIds.has(comp.id);
        const hasPpki    = comp.targetGroups.some((tg) => tg.targetGroup.ppki);

        return (
          <div
            key={comp.id}
            className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex"
          >
            {/* Left colour bar */}
            <div className="w-1.5 shrink-0" style={{ backgroundColor: themeColor }} />

            <div className="flex-1 p-5 space-y-3">
              {/* Name + code row */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold dark:text-zinc-100 leading-snug">
                    <span className="font-mono">{comp.code}</span> — {comp.name}
                  </h2>
                </div>

                {/* Badges */}
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                      isTeam
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                        : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    }`}
                  >
                    {isTeam ? <Users className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    {isTeam ? "Berpasukan" : "Individu"}
                  </span>

                  {hasPpki && (
                    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                      PPKI
                    </span>
                  )}

                  {enrolled && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300">
                      <CheckCircle2 className="h-3 w-3" /> Disertai
                    </span>
                  )}
                </div>
              </div>

              {/* Description */}
              {comp.description && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-3">
                  {comp.description}
                </p>
              )}

              {/* Venue */}
              {comp.venue && (
                <div className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {comp.venue}
                </div>
              )}

              {/* Date range — only shown when at least one date is set */}
              {(comp.startDate ?? comp.endDate) && (
                <div className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  {formatDateRange(comp.startDate, comp.endDate)}
                </div>
              )}

              {/* EptimEdu course name */}
              {comp.eptimEduCourseTitle && (
                <div className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                  <span className="text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40 rounded px-1.5 py-0.5">
                    LMS
                  </span>
                  {comp.eptimEduCourseTitle}
                </div>
              )}

              {/* Theme */}
              {comp.theme && (
                <div className="flex items-center gap-2 pt-1">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: themeColor }}
                  />
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {comp.theme.name}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
