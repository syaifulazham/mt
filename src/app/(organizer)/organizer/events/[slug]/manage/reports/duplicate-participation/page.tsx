import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";

export const metadata: Metadata = { title: "Penyertaan Berganda" };

type TeamPair = { team: string; contingent: string };

type DuplicateParticipant = {
  id: string;
  name: string;
  ic: string | null;
  teamCount: number;
  competitionCount: number;
  teamPairs: TeamPair[];
  competitions: string;
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

  const rows = await db.$queryRaw<{
    participantId: string;
    name: string;
    ic: string | null;
    teamCount: bigint;
    competitionCount: bigint;
    teamPairs: { team: string; contingent: string }[];
    competitions: string;
  }[]>`
    WITH event_teams AS (
      SELECT t.id AS "teamId", t.name AS "teamName", t."competitionId", c.name AS "competitionName", cont.name AS "contingentName"
      FROM team_events te
      JOIN teams t ON t.id = te."teamId"
      JOIN competitions c ON c.id = t."competitionId"
      LEFT JOIN contingents cont ON cont.id = t."contingentId"
      WHERE te."eventId" = ${event.id}
        AND te.acceptance IN ('PENDING', 'ACCEPT')
    ),
    participant_teams AS (
      SELECT
        p.id AS "participantId",
        p.name,
        p.ic,
        et."teamId",
        et."teamName",
        et."competitionId",
        et."competitionName",
        et."contingentName"
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
        JSON_BUILD_OBJECT('team', "teamName", 'contingent', COALESCE("contingentName", '—'))
        ORDER BY "teamName"
      ) AS "teamPairs",
      STRING_AGG(DISTINCT "competitionName", ', ' ORDER BY "competitionName") AS competitions
    FROM participant_teams
    GROUP BY "participantId"
    HAVING COUNT(DISTINCT "teamId") > 1 OR COUNT(DISTINCT "competitionId") > 1
    ORDER BY name
  `;

  const participants: DuplicateParticipant[] = rows.map(r => ({
    id: r.participantId,
    name: r.name,
    ic: r.ic,
    teamCount: Number(r.teamCount),
    competitionCount: Number(r.competitionCount),
    teamPairs: r.teamPairs,
    competitions: r.competitions,
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
                {participants.map(p => (
                  <tr key={p.id} className="hover:bg-zinc-50 align-top">
                    <td className="px-4 py-3 text-zinc-900">{p.name}</td>
                    <td className="px-4 py-3 text-zinc-600 font-mono text-xs">{p.ic ?? '-'}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        {p.teamPairs.map((pair, i) => (
                          <div key={i}>
                            <div className="text-xs font-semibold text-zinc-800">{pair.contingent}</div>
                            <div className="text-xs text-zinc-500 mt-0.5">{pair.team}</div>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold" title={p.competitions}>
                        {p.competitionCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </OrganizerShell>
  );
}
