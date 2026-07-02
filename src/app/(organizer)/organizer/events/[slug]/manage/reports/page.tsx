import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { EventReportsClient } from "@/components/organizer/events/EventReportsClient";
import type { CompetitionEntry, CompetitionStateStat } from "@/lib/export/eventReportExport";

export type { CompetitionEntry, CompetitionStateStat };

export const metadata: Metadata = { title: "Laporan" };

export default async function EventReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;

  const event = await db.event.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true,
      eventCompetitions: {
        select: {
          competition: {
            select: {
              id: true, name: true, code: true,
              targetGroups: {
                select: { targetGroup: { select: { schoolLevel: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!event) redirect("/organizer/events");

  const competitionIds = event.eventCompetitions.map(ec => ec.competition.id);

  // Team + participant counts per competition and per competition×state
  const [countRows, stateRows] = competitionIds.length
    ? await Promise.all([
        db.$queryRaw<{ competitionId: string; teams: bigint; participants: bigint }[]>`
          SELECT
            t."competitionId",
            COUNT(DISTINCT t.id)              AS teams,
            COUNT(DISTINCT tm."contestantId") AS participants
          FROM teams t
          JOIN team_events te ON te."teamId" = t.id AND te."eventId" = ${event.id}
          LEFT JOIN team_members tm ON tm."teamId" = t.id
          WHERE t."competitionId" IN (${Prisma.join(competitionIds)})
          GROUP BY t."competitionId"
        `,
        db.$queryRaw<{ competitionId: string; stateName: string; teams: bigint; participants: bigint }[]>`
          SELECT
            t."competitionId",
            COALESCE(s.name, sch_state.name, hi_state.name, 'Lain-lain') AS "stateName",
            COUNT(DISTINCT t.id)              AS teams,
            COUNT(DISTINCT tm."contestantId") AS participants
          FROM teams t
          JOIN team_events te ON te."teamId" = t.id AND te."eventId" = ${event.id}
          LEFT JOIN team_members     tm        ON tm."teamId"  = t.id
          LEFT JOIN contingents      cont      ON cont.id      = t."contingentId"
          LEFT JOIN states           s         ON s.id         = cont."stateId"
          LEFT JOIN schools          sch       ON sch.id       = cont."schoolId"
          LEFT JOIN states           sch_state ON sch_state.id = sch."stateId"
          LEFT JOIN higher_institutions hi     ON hi.id        = cont."higherInstitutionId"
          LEFT JOIN states           hi_state  ON hi_state.id  = hi."stateId"
          WHERE t."competitionId" IN (${Prisma.join(competitionIds)})
          GROUP BY t."competitionId", COALESCE(s.name, sch_state.name, hi_state.name, 'Lain-lain')
          ORDER BY "stateName", t."competitionId"
        `,
      ])
    : [[], []];

  const countMap = new Map(countRows.map(r => [r.competitionId, r]));

  const competitions: CompetitionEntry[] = event.eventCompetitions
    .map(ec => {
      const cnt = countMap.get(ec.competition.id);
      return {
        id:           ec.competition.id,
        name:         ec.competition.name,
        code:         ec.competition.code,
        schoolLevels: ec.competition.targetGroups.map(tg => tg.targetGroup.schoolLevel),
        teams:        Number(cnt?.teams ?? 0),
        participants: Number(cnt?.participants ?? 0),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const competitionStateStats: CompetitionStateStat[] = stateRows.map(r => ({
    competitionId: r.competitionId,
    stateName:     r.stateName,
    teams:         Number(r.teams),
    participants:  Number(r.participants),
  }));

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <EventReportsClient
        eventId={event.id}
        eventName={event.name}
        slug={event.slug}
        competitions={competitions}
        competitionStateStats={competitionStateStats}
      />
    </OrganizerShell>
  );
}
