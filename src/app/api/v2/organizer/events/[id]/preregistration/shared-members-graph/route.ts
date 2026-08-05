import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

type SharedMemberRow = {
  participantId: string;
  memberName: string;
  teamIds: string[];
};

type TeamMemberRow = {
  teamId: string;
  teamName: string;
  contingentName: string | null;
  stateName: string | null;
  memberId: string | null;
  memberName: string | null;
};

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;

  // Participants appearing in 2+ teams for this event (non-REJECT)
  const sharedRows = await db.$queryRaw<SharedMemberRow[]>`
    SELECT
      tm."contestantId"                      AS "participantId",
      p.name                                 AS "memberName",
      array_agg(DISTINCT t.id ORDER BY t.id) AS "teamIds"
    FROM team_events  te
    JOIN teams        t   ON t.id  = te."teamId"
    JOIN team_members tm  ON tm."teamId" = t.id
    JOIN contestants  p   ON p.id  = tm."contestantId"
    WHERE te."eventId"   = ${eventId}
      AND te.acceptance  <> 'REJECT'
    GROUP BY tm."contestantId", p.name
    HAVING COUNT(DISTINCT t.id) > 1
  `;

  if (sharedRows.length === 0) {
    return NextResponse.json({ teams: [], sharedMembers: [] });
  }

  const involvedTeamIds = [...new Set(sharedRows.flatMap(r => r.teamIds))];

  // Full team + member list for every involved team
  const rows = await db.$queryRaw<TeamMemberRow[]>`
    SELECT
      t.id                                                   AS "teamId",
      t.name                                                 AS "teamName",
      cont.name                                              AS "contingentName",
      COALESCE(s.name, sch_state.name, hi_state.name)        AS "stateName",
      p.id                                                   AS "memberId",
      p.name                                                 AS "memberName"
    FROM teams t
    LEFT JOIN contingents         cont      ON cont.id = t."contingentId"
    LEFT JOIN states              s         ON s.id    = cont."stateId"
    LEFT JOIN schools             sch       ON sch.id  = cont."schoolId"
    LEFT JOIN states              sch_state ON sch_state.id = sch."stateId"
    LEFT JOIN higher_institutions hi        ON hi.id   = cont."higherInstitutionId"
    LEFT JOIN states              hi_state  ON hi_state.id  = hi."stateId"
    LEFT JOIN team_members        tm        ON tm."teamId"   = t.id
    LEFT JOIN contestants         p         ON p.id = tm."contestantId"
    WHERE t.id IN (${Prisma.join(involvedTeamIds)})
    ORDER BY t.id, p.name
  `;

  // Group rows by team
  const teamMap = new Map<string, {
    id: string;
    teamName: string;
    contingentName: string | null;
    stateName: string | null;
    members: { id: string; name: string }[];
  }>();

  for (const row of rows) {
    if (!teamMap.has(row.teamId)) {
      teamMap.set(row.teamId, {
        id: row.teamId,
        teamName: row.teamName,
        contingentName: row.contingentName,
        stateName: row.stateName,
        members: [],
      });
    }
    if (row.memberId && row.memberName) {
      teamMap.get(row.teamId)!.members.push({ id: row.memberId, name: row.memberName });
    }
  }

  return NextResponse.json({
    teams: [...teamMap.values()],
    sharedMembers: sharedRows.map(r => ({
      memberId: r.participantId,
      memberName: r.memberName,
      teamIds: r.teamIds,
    })),
  });
}
