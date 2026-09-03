import { redirect } from "next/navigation";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import type { Metadata } from "next";
import { Swords, Users, User2, Phone, MapPin, Calendar, CalendarDays } from "lucide-react";
import { EptimEduLoginButton } from "@/components/participant/EptimEduLoginButton";
import { EptimDroneTeamButton } from "@/components/participant/EptimDroneTeamButton";
import { EptimWebcraftButton } from "@/components/participant/EptimWebcraftButton";

export const metadata: Metadata = { title: "Pasukan Saya" };

/* ── helpers ─────────────────────────────────────────────────────────── */

function formatDateRange(start: Date | null, end: Date | null): string {
  if (!start && !end) return "—";
  const fmt = (d: Date) =>
    d.toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return fmt(start);
  return fmt(end!);
}

/* ── component ───────────────────────────────────────────────────────── */

export default async function TeamPage() {
  const session = await getParticipantSession();
  if (!session) redirect("/participant/sign-in");

  const memberships = await db.teamMember.findMany({
    where: { participantId: session.participantId },
    include: {
      team: {
        include: {
          competition: {
            select: {
              name: true,
              code: true,
              venue: true,
              startDate: true,
              endDate: true,
              eptimEduCourseId: true,
              thirdPartyIntegration: true,
              theme: { select: { name: true, color: true } },
            },
          },
          members: {
            include: {
              participant: { select: { id: true, name: true, gender: true } },
            },
          },
          trainers: {
            include: {
              trainer: { select: { name: true, phoneNumber: true } },
            },
          },
          teamEvents: {
            include: {
              event: {
                select: {
                  id: true,
                  name: true,
                  startDate: true,
                  endDate: true,
                  status: true,
                  eventCompetitions: {
                    select: {
                      competitionId: true,
                      eptimEduCourseId: true,
                      eptimEduCourseTitle: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  return (
    <div className="max-w-2xl space-y-5">
      {/* Page heading */}
      <div>
        <h1 className="text-xl font-bold dark:text-zinc-100">Pasukan Saya</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Senarai pasukan yang anda sertai
        </p>
      </div>

      {/* Empty state */}
      {memberships.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 py-16 px-6 text-center">
          <div className="rounded-full bg-zinc-100 dark:bg-zinc-800 p-4">
            <Swords className="h-8 w-8 text-zinc-400 dark:text-zinc-500" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-medium dark:text-zinc-200">Belum dalam mana-mana pasukan</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Hubungi pengurus kontingen anda untuk didaftarkan ke dalam pasukan.
            </p>
          </div>
        </div>
      )}

      {/* Team cards */}
      {memberships.map(({ team }) => {
        const comp        = team.competition;
        const themeColor  = comp.theme?.color ?? "#085782";
        const competitionId = team.competitionId;

        return (
          <div
            key={team.id}
            className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
          >
            {/* Color bar */}
            <div className="h-1.5 w-full" style={{ backgroundColor: themeColor }} />

            <div className="p-5 space-y-4">
              {/* Team name + competition */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold dark:text-zinc-100">{team.name}</h2>
                  <p className="text-sm text-[#085782] dark:text-blue-400 font-medium">
                    {comp.name}
                    <span className="ml-2 text-xs font-normal bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded">
                      {comp.code}
                    </span>
                  </p>
                </div>
                {(team.lmsUserId || comp.eptimEduCourseId) && (
                  <EptimEduLoginButton teamId={team.id} />
                )}
              </div>

              {/* Venue + dates */}
              <div className="flex flex-col sm:flex-row gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                {comp.venue && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {comp.venue}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  {formatDateRange(comp.startDate, comp.endDate)}
                </span>
              </div>

              {/* Theme */}
              {comp.theme && (
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: themeColor }}
                  />
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {comp.theme.name}
                  </span>
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-zinc-100 dark:border-zinc-800" />

              {/* Members */}
              <div>
                <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Ahli Pasukan
                </p>
                <ul className="space-y-1.5">
                  {team.members.map(({ participant: p }) => (
                    <li key={p.id} className="flex items-center gap-2 text-sm dark:text-zinc-200">
                      <User2
                        className={`h-3.5 w-3.5 shrink-0 ${
                          p.gender === "FEMALE"
                            ? "text-pink-400 dark:text-pink-300"
                            : "text-blue-400 dark:text-blue-300"
                        }`}
                      />
                      <span className={p.id === session.participantId ? "font-semibold" : ""}>
                        {p.name}
                        {p.id === session.participantId && (
                          <span className="ml-1.5 text-[10px] bg-[#085782]/10 text-[#085782] dark:bg-blue-900/40 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                            Anda
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Trainers */}
              {team.trainers.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <User2 className="h-3.5 w-3.5" />
                    Jurulatih
                  </p>
                  <ul className="space-y-1.5">
                    {team.trainers.map(({ trainer }) => (
                      <li
                        key={trainer.name}
                        className="flex items-center justify-between text-sm dark:text-zinc-200"
                      >
                        <span>{trainer.name}</span>
                        {trainer.phoneNumber && (
                          <a
                            href={`tel:${trainer.phoneNumber}`}
                            className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500 hover:text-[#085782] dark:hover:text-blue-400 transition-colors"
                          >
                            <Phone className="h-3 w-3" />
                            {trainer.phoneNumber}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Joined Events with per-event Bengkel MT button */}
              {team.teamEvents.length > 0 && (
                <div>
                  <div className="border-t border-zinc-100 dark:border-zinc-800 mb-3" />
                  <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Acara Disertai
                  </p>
                  <div className="space-y-2">
                    {team.teamEvents.map(({ event }) => {
                      const ec = event.eventCompetitions.find(
                        (e) => e.competitionId === competitionId,
                      );
                      const courseId = ec?.eptimEduCourseId ?? comp.eptimEduCourseId ?? null;
                      return (
                        <div
                          key={event.id}
                          className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700/50 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium dark:text-zinc-200 truncate">
                              {event.name}
                            </p>
                            <p className="text-xs text-zinc-400">
                              {formatDateRange(event.startDate, event.endDate)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {courseId && (
                              <EptimEduLoginButton teamId={team.id} eventId={event.id} />
                            )}
                            {comp.thirdPartyIntegration === "eptim-drone" && (
                              <EptimDroneTeamButton teamId={team.id} />
                            )}
                            {comp.thirdPartyIntegration === "eptim-webcraft" && (
                              <EptimWebcraftButton />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
