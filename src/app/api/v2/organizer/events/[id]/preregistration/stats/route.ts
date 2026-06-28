import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

type SummaryRow = {
  school_contingents: bigint;
  primary_schools:    bigint;
  secondary_schools:  bigint;
  total_teams:        bigint;
  total_participants: bigint;
  male:               bigint;
  female:             bigint;
};

type GradeRow = {
  eduLevel:   string;
  classGrade: string | null;
  count:      bigint;
};

type StateRow = {
  state_name:         string | null;
  school_contingents: bigint;
  primary_schools:    bigint;
  secondary_schools:  bigint;
  total_teams:        bigint;
  total_participants: bigint;
  male:               bigint;
  female:             bigint;
};

// GET /api/v2/organizer/events/[id]/preregistration/stats
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;

  // Identical FROM…JOIN block as the preregistration list route.
  // team_events ensures only teams that joined the event are counted.
  const fromJoins = Prisma.sql`
    FROM team_members tm
    JOIN contestants          p          ON p.id   = tm."contestantId"
    JOIN teams                t          ON t.id   = tm."teamId"
    JOIN team_events          te         ON te."teamId"  = t.id  AND te."eventId" = ${eventId}
    JOIN competitions         c          ON c.id   = t."competitionId"
    JOIN event_competitions   ec         ON ec."competitionId" = c.id AND ec."eventId" = ${eventId}
    LEFT JOIN contingents     cont       ON cont.id = t."contingentId"
    LEFT JOIN states          s          ON s.id   = cont."stateId"
    LEFT JOIN schools         sch        ON sch.id = cont."schoolId"
    LEFT JOIN states          sch_state  ON sch_state.id = sch."stateId"
    LEFT JOIN higher_institutions hi     ON hi.id  = cont."higherInstitutionId"
    LEFT JOIN states          hi_state   ON hi_state.id = hi."stateId"
  `;

  try {
    const [summaryRows, gradeRows, stateRows] = await Promise.all([
      db.$queryRaw<SummaryRow[]>`
        SELECT
          COUNT(DISTINCT cont.id) FILTER (WHERE cont."contingentType" = 'SCHOOL')                                      AS school_contingents,
          COUNT(DISTINCT cont.id) FILTER (WHERE cont."contingentType" = 'SCHOOL' AND p."eduLevel" = 'PRIMARY')         AS primary_schools,
          COUNT(DISTINCT cont.id) FILTER (WHERE cont."contingentType" = 'SCHOOL' AND p."eduLevel" = 'SECONDARY')       AS secondary_schools,
          COUNT(DISTINCT t.id)                                                                                          AS total_teams,
          COUNT(DISTINCT p.id)                                                                                          AS total_participants,
          COUNT(DISTINCT p.id) FILTER (WHERE p.gender = 'MALE')                                                        AS male,
          COUNT(DISTINCT p.id) FILTER (WHERE p.gender = 'FEMALE')                                                      AS female
        ${fromJoins}
        WHERE 1=1
      `,
      db.$queryRaw<GradeRow[]>`
        SELECT
          p."eduLevel"   AS "eduLevel",
          p."classGrade" AS "classGrade",
          COUNT(DISTINCT p.id) AS count
        ${fromJoins}
        WHERE p."classGrade" IS NOT NULL
        GROUP BY p."eduLevel", p."classGrade"
        ORDER BY p."eduLevel", p."classGrade"
      `,
      db.$queryRaw<StateRow[]>`
        SELECT
          COALESCE(s.name, sch_state.name, hi_state.name)                                                              AS state_name,
          COUNT(DISTINCT cont.id) FILTER (WHERE cont."contingentType" = 'SCHOOL')                                      AS school_contingents,
          COUNT(DISTINCT cont.id) FILTER (WHERE cont."contingentType" = 'SCHOOL' AND p."eduLevel" = 'PRIMARY')         AS primary_schools,
          COUNT(DISTINCT cont.id) FILTER (WHERE cont."contingentType" = 'SCHOOL' AND p."eduLevel" = 'SECONDARY')       AS secondary_schools,
          COUNT(DISTINCT t.id)                                                                                          AS total_teams,
          COUNT(DISTINCT p.id)                                                                                          AS total_participants,
          COUNT(DISTINCT p.id) FILTER (WHERE p.gender = 'MALE')                                                        AS male,
          COUNT(DISTINCT p.id) FILTER (WHERE p.gender = 'FEMALE')                                                      AS female
        ${fromJoins}
        WHERE 1=1
        GROUP BY COALESCE(s.name, sch_state.name, hi_state.name)
        ORDER BY COALESCE(s.name, sch_state.name, hi_state.name)
      `,
    ]);

    const s = summaryRows[0];

    return NextResponse.json({
      summary: {
        schoolContingents: Number(s?.school_contingents ?? 0),
        primarySchools:    Number(s?.primary_schools    ?? 0),
        secondarySchools:  Number(s?.secondary_schools  ?? 0),
        teams:             Number(s?.total_teams        ?? 0),
        participants:      Number(s?.total_participants ?? 0),
        male:              Number(s?.male               ?? 0),
        female:            Number(s?.female             ?? 0),
      },
      byGrade: gradeRows.map((r) => ({
        eduLevel:   r.eduLevel,
        classGrade: r.classGrade ?? "–",
        count:      Number(r.count),
      })),
      byState: stateRows.map((r) => ({
        stateName:         r.state_name ?? "–",
        schoolContingents: Number(r.school_contingents),
        primarySchools:    Number(r.primary_schools),
        secondarySchools:  Number(r.secondary_schools),
        teams:             Number(r.total_teams),
        participants:      Number(r.total_participants),
        male:              Number(r.male),
        female:            Number(r.female),
      })),
    });
  } catch (e) {
    console.error("[preregistration/stats]", e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 422 });
  }
}
