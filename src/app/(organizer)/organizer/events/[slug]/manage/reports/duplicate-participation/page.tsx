import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";

export const metadata: Metadata = { title: "Penyertaan Berganda" };

type TeamPair = {
  team: string;
  contingent: string;
  competitionCode: string;
  competitionName: string;
  acceptance: string;
};

type DuplicateParticipant = {
  id: string;
  name: string;
  ic: string | null;
  teamCount: number;
  competitionCount: number;
  teamPairs: TeamPair[];
};

const ACCEPTANCE_BADGE: Record<string, { label: string; cls: string }> = {
  ACCEPT:  { label: "ACCEPT",  cls: "bg-emerald-100 text-emerald-700" },
  PENDING: { label: "PENDING", cls: "bg-amber-100 text-amber-700" },
  REJECT:  { label: "REJECT",  cls: "bg-rose-100 text-rose-600" },
};

export default async function DuplicateParticipationPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;

  const event = await db.event.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });

  if (!event) redirect("/organizer/events");

  // Matches the preregistration "pasukan berkongsi ahli" logic:
  // detect sharing across ALL teams (any acceptance), then show each team with its status.
  const rows = await db.$queryRaw<{
    participantId: string;
    name: string;
    ic: string | null;
    teamCount: bigint;
    competitionCount: bigint;
    teamPairs: TeamPair[];
  }[]>`
    WITH event_teams AS (
      SELECT
        t.id AS "teamId",
        t.name AS "teamName",
        t."competitionId",
        c.code AS "competitionCode",
        c.name AS "competitionName",
        COALESCE(cont.name, '—') AS "contingentName",
        te.acceptance
      FROM team_events te
      JOIN teams t ON t.id = te."teamId"
      JOIN competitions c ON c.id = t."competitionId"
      LEFT JOIN contingents cont ON cont.id = t."contingentId"
      WHERE te."eventId" = ${event.id}
    ),
    participant_teams AS (
      SELECT
        p.id AS "participantId",
        p.name,
        p.ic,
        et."teamId",
        et."teamName",
        et."competitionId",
        et."competitionCode",
        et."competitionName",
        et."contingentName",
        et.acceptance
      FROM team_members tm
      JOIN contestants p ON p.id = tm."contestantId"
      JOIN event_teams et ON et."teamId" = tm."teamId"
    )
    SELECT
      "participantId",
      MAX(name) AS name,
      MAX(ic) AS ic,
      COUNT(DISTINCT "teamId") AS "teamCount",
      COUNT(DISTINCT "competitionId") AS "competitionCount",
      JSON_AGG(
        JSON_BUILD_OBJECT(
          'team', "teamName",
          'contingent', "contingentName",
          'competitionCode', "competitionCode",
          'competitionName', "competitionName",
          'acceptance', acceptance
        )
        ORDER BY "contingentName", "teamName"
      ) AS "teamPairs"
    FROM participant_teams
    GROUP BY "participantId"
    HAVING COUNT(DISTINCT "teamId") > 1
    ORDER BY name
  `;

  const participants: DuplicateParticipant[] = rows.map(r => ({
    id: r.participantId,
    name: r.name,
    ic: r.ic,
    teamCount: Number(r.teamCount),
    competitionCount: Number(r.competitionCount),
    teamPairs: r.teamPairs,
  }));

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-start gap-3 mb-6">
          <Link
            href={`/organizer/events/${slug}/manage/reports`}
            className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Kembali
          </Link>
          <div>
            <h1 className="text-lg font-bold text-zinc-900">Penyertaan Berganda</h1>
            <p className="text-sm text-zinc-400">
              Peserta yang menyertai lebih daripada satu pasukan atau pertandingan.
            </p>
          </div>
        </div>

        {participants.length === 0 ? (
          <div className="rounded-xl border bg-zinc-50 p-8 text-center text-zinc-500">
            <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Tiada penyertaan berganda dikesan.</p>
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">Nama</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">No. Kad Pengenalan</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">Kontinjen &amp; Pasukan</th>
                  <th className="px-4 py-3 text-center font-medium text-zinc-600">Pertandingan</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {participants.map(p => {
                  const grouped = new Map<string, TeamPair[]>();
                  for (const pair of p.teamPairs) {
                    if (!grouped.has(pair.contingent)) grouped.set(pair.contingent, []);
                    grouped.get(pair.contingent)!.push(pair);
                  }
                  const acceptCount = p.teamPairs.filter(t => t.acceptance === "ACCEPT").length;
                  return (
                    <tr key={p.id} className="hover:bg-zinc-50 align-top">
                      <td className="px-4 py-3 text-zinc-900 font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-zinc-600 font-mono text-xs">{p.ic ?? '-'}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-3">
                          {[...grouped.entries()].map(([contingent, teams]) => (
                            <div key={contingent}>
                              <div className="text-xs font-semibold text-zinc-800 mb-1">{contingent}</div>
                              <div className="space-y-1 pl-2">
                                {teams.map((t, i) => {
                                  const badge = ACCEPTANCE_BADGE[t.acceptance] ?? { label: t.acceptance, cls: "bg-zinc-100 text-zinc-500" };
                                  const isReject = t.acceptance === "REJECT";
                                  return (
                                    <div
                                      key={i}
                                      className={`rounded border px-2.5 py-1.5 flex items-start justify-between gap-2 ${isReject ? "border-zinc-100 bg-white opacity-60" : "border-zinc-200 bg-zinc-50"}`}
                                    >
                                      <div className="min-w-0">
                                        <div className="text-[10px] font-mono text-zinc-400 leading-tight">
                                          {t.competitionCode} · {t.competitionName}
                                        </div>
                                        <div className={`text-xs font-medium mt-0.5 ${isReject ? "text-zinc-400 line-through" : "text-zinc-700"}`}>
                                          {t.team}
                                        </div>
                                      </div>
                                      <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${badge.cls}`}>
                                        {badge.label}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold"
                          title={`${acceptCount} pasukan ACCEPT`}
                        >
                          {acceptCount}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </OrganizerShell>
  );
}
