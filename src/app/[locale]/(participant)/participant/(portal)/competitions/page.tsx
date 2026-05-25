import { redirect } from "next/navigation";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import type { Metadata } from "next";
import { Trophy, MapPin, Calendar, Users, User } from "lucide-react";

export const metadata: Metadata = { title: "Pertandingan" };

/* ── helpers ─────────────────────────────────────────────────────────── */

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("ms-MY", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateRange(start: Date | null, end: Date | null): string {
  if (!start && !end) return "Tarikh belum ditetapkan";
  if (start && end) return `${fmtDate(start)} – ${fmtDate(end)}`;
  if (start) return fmtDate(start);
  return fmtDate(end);
}

/* ── component ───────────────────────────────────────────────────────── */

export default async function CompetitionsPage() {
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
              description: true,
              venue: true,
              startDate: true,
              endDate: true,
              participationType: true,
              theme: { select: { name: true, color: true } },
            },
          },
        },
      },
    },
  });

  // De-duplicate competitions (a participant could be in multiple teams in the
  // same competition, though unlikely — guard it anyway)
  const competitionMap = new Map<
    string,
    (typeof memberships)[number]["team"]["competition"]
  >();
  for (const { team } of memberships) {
    if (!competitionMap.has(team.competition.code)) {
      competitionMap.set(team.competition.code, team.competition);
    }
  }
  const competitions = Array.from(competitionMap.values());

  return (
    <div className="max-w-2xl space-y-5">
      {/* Page heading */}
      <div>
        <h1 className="text-xl font-bold dark:text-zinc-100">Pertandingan</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Pertandingan yang anda sertai
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
              Anda belum didaftarkan dalam mana-mana pertandingan.
            </p>
          </div>
        </div>
      )}

      {/* Competition cards */}
      {competitions.map((comp) => {
        const themeColor = comp.theme?.color ?? "#085782";
        const isTeam = comp.participationType === "TEAM";

        return (
          <div
            key={comp.code}
            className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex"
          >
            {/* Left colour bar */}
            <div className="w-1.5 shrink-0" style={{ backgroundColor: themeColor }} />

            <div className="flex-1 p-5 space-y-3">
              {/* Name + code */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold dark:text-zinc-100 leading-snug">
                    {comp.name}
                  </h2>
                  <span className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded font-mono">
                    {comp.code}
                  </span>
                </div>

                {/* Individual / Team badge */}
                <span
                  className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                    isTeam
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  }`}
                >
                  {isTeam ? (
                    <Users className="h-3 w-3" />
                  ) : (
                    <User className="h-3 w-3" />
                  )}
                  {isTeam ? "Berpasukan" : "Individu"}
                </span>
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

              {/* Date range */}
              <div className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                {formatDateRange(comp.startDate, comp.endDate)}
              </div>

              {/* Theme dot + name */}
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
