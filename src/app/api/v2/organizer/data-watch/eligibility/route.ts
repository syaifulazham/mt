import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { targetGroupMatchSql } from "@/lib/targetGroupMatch";
import { logError } from "@/lib/appLogger";

type TgCompRow = {
  tgId: string; tgCode: string; tgName: string; tgSchoolLevel: string; tgAgeGroup: string;
  compId: string; compCode: string; compName: string;
};

type CompStatsRow = {
  compId: string; eligibleCount: bigint; registeredCount: bigint;
};

// GET /api/v2/organizer/data-watch/eligibility
// All competitions with eligible/registered participant counts (deduped per
// competition across its target groups), grouped by target group, ordered by
// competition name.
export async function GET(_req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const matchSql = targetGroupMatchSql("p", "tg");

    const [pairs, compStats, ungrouped] = await Promise.all([
      // Target-group × competition pairs (display grouping)
      db.$queryRaw<TgCompRow[]>`
        SELECT
          tg.id            AS "tgId",
          tg.code          AS "tgCode",
          tg.name          AS "tgName",
          tg."schoolLevel" AS "tgSchoolLevel",
          tg."ageGroup"    AS "tgAgeGroup",
          c.id             AS "compId",
          c.code           AS "compCode",
          c.name           AS "compName"
        FROM   competition_target_groups ctg
        JOIN   target_groups tg ON tg.id = ctg."targetGroupId"
        JOIN   competitions  c  ON c.id  = ctg."competitionId"
        ORDER  BY tg."schoolLevel", tg.name, c.name
      `,
      // Per-competition stats: distinct eligible ACTIVE participants (any of the
      // competition's target groups) + distinct registered participants (team members)
      db.$queryRaw<CompStatsRow[]>`
        SELECT
          c.id AS "compId",
          (
            SELECT COUNT(DISTINCT p.id)
            FROM   contestants p
            WHERE  p.status = 'ACTIVE'
              AND  EXISTS (
                SELECT 1
                FROM   competition_target_groups ctg
                JOIN   target_groups tg ON tg.id = ctg."targetGroupId"
                WHERE  ctg."competitionId" = c.id
                  AND  (${matchSql})
              )
          ) AS "eligibleCount",
          (
            SELECT COUNT(DISTINCT rs."contestantId")
            FROM   registration_stats rs
            WHERE  rs."competitionId" = c.id
          ) AS "registeredCount"
        FROM competitions c
      `,
      // Competitions with no target group — every ACTIVE participant is eligible
      db.$queryRaw<{ compId: string; compCode: string; compName: string }[]>`
        SELECT c.id AS "compId", c.code AS "compCode", c.name AS "compName"
        FROM   competitions c
        WHERE  NOT EXISTS (
          SELECT 1 FROM competition_target_groups ctg WHERE ctg."competitionId" = c.id
        )
        ORDER  BY c.name
      `,
    ]);

    const statsMap = new Map(compStats.map(s => [s.compId, {
      eligibleCount:   Number(s.eligibleCount),
      registeredCount: Number(s.registeredCount),
    }]));

    // Union of classGrades per competition (for per-grade targets in the UI)
    const tgLinks = await db.competitionTargetGroup.findMany({
      include: { targetGroup: { select: { classGrades: true } } },
    });
    const gradesMap = new Map<string, string[]>();
    for (const l of tgLinks) {
      const set = new Set(gradesMap.get(l.competitionId) ?? []);
      for (const g of l.targetGroup.classGrades) set.add(g);
      gradesMap.set(l.competitionId, [...set].sort());
    }

    type CompEntry = { id: string; code: string; name: string; eligibleCount: number; registeredCount: number; grades: string[] };
    const toEntry = (compId: string, compCode: string, compName: string): CompEntry => ({
      id: compId,
      code: compCode,
      name: compName,
      eligibleCount:   statsMap.get(compId)?.eligibleCount   ?? 0,
      registeredCount: statsMap.get(compId)?.registeredCount ?? 0,
      grades: gradesMap.get(compId) ?? [],
    });

    // Group flat pairs by target group
    const groupMap = new Map<string, {
      targetGroup: { id: string; code: string; name: string; schoolLevel: string; ageGroup: string };
      competitions: CompEntry[];
    }>();

    for (const r of pairs) {
      let g = groupMap.get(r.tgId);
      if (!g) {
        g = {
          targetGroup: { id: r.tgId, code: r.tgCode, name: r.tgName, schoolLevel: r.tgSchoolLevel, ageGroup: r.tgAgeGroup },
          competitions: [],
        };
        groupMap.set(r.tgId, g);
      }
      g.competitions.push(toEntry(r.compId, r.compCode, r.compName));
    }

    const data = [...groupMap.values()];

    if (ungrouped.length > 0) {
      data.push({
        targetGroup: { id: "__NONE__", code: "—", name: "Tiada Kumpulan Sasaran", schoolLevel: "", ageGroup: "Semua" },
        competitions: ungrouped.map(u => toEntry(u.compId, u.compCode, u.compName)),
      });
    }

    return NextResponse.json({ data, totalCompetitions: statsMap.size });
  } catch (err) {
    logError("data-watch/eligibility", err);
    return NextResponse.json({ error: String(err) }, { status: 422 });
  }
}
