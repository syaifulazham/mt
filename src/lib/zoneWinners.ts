import { db } from "@/lib/db";

const ZONE_SCOPES = ["ZONE", "ONLINE_ZONE"] as const;

/**
 * Returns the set of participant IDs who were declared winners
 * (rank <= maxRank) in any ZONE / ONLINE_ZONE scoped event competition
 * whose event status is COMPLETED.
 *
 * Ranking mirrors the public results board: sum of criterion scores per team
 * per event competition, ties broken by best (lowest) time.
 */
export async function getZoneWinnerParticipantIds(maxRank: number): Promise<Set<string>> {
  const zoneEventComps = await db.eventCompetition.findMany({
    where: { event: { scope: { in: [...ZONE_SCOPES] }, status: "COMPLETED" } },
    select: {
      id: true,
      judgingTasks: {
        select: {
          scores: {
            select: { teamId: true, score: true, timeSeconds: true },
          },
        },
      },
    },
  });

  const winnerTeamIds = new Set<string>();

  for (const ec of zoneEventComps) {
    const agg = new Map<string, { total: number; best: number | null }>();
    for (const task of ec.judgingTasks) {
      for (const s of task.scores) {
        const cur = agg.get(s.teamId) ?? { total: 0, best: null };
        if (s.score !== null) cur.total += s.score;
        if (s.timeSeconds !== null && (cur.best === null || s.timeSeconds < cur.best)) {
          cur.best = s.timeSeconds;
        }
        agg.set(s.teamId, cur);
      }
    }
    if (agg.size === 0) continue;

    const ranked = [...agg.entries()].sort((a, b) => {
      if (b[1].total !== a[1].total) return b[1].total - a[1].total;
      if (a[1].best === null && b[1].best === null) return 0;
      if (a[1].best === null) return 1;
      if (b[1].best === null) return -1;
      return a[1].best - b[1].best;
    });

    ranked.slice(0, maxRank).forEach(([teamId]) => winnerTeamIds.add(teamId));
  }

  if (winnerTeamIds.size === 0) return new Set();

  const members = await db.teamMember.findMany({
    where: { teamId: { in: [...winnerTeamIds] } },
    select: { participantId: true },
  });

  return new Set(members.map(m => m.participantId));
}

/**
 * Check whether any member of the given team is a zone winner (rank <= maxRank).
 */
export async function teamHasZoneWinner(teamId: string, maxRank: number): Promise<boolean> {
  const winnerIds = await getZoneWinnerParticipantIds(maxRank);
  if (winnerIds.size === 0) return false;

  const count = await db.teamMember.count({
    where: { teamId, participantId: { in: [...winnerIds] } },
  });
  return count > 0;
}
