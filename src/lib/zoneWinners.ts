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
  const details = await getZoneWinnerDetails(maxRank);
  return new Set(details.keys());
}

/**
 * Like getZoneWinnerParticipantIds but returns a map of
 * participantId -> set of zone names (fallback: event name) they won in.
 */
export async function getZoneWinnerDetails(maxRank: number): Promise<Map<string, Set<string>>> {
  const zoneEventComps = await db.eventCompetition.findMany({
    where: { event: { scope: { in: [...ZONE_SCOPES] }, status: "COMPLETED" } },
    select: {
      id: true,
      event: { select: { name: true, zone: { select: { name: true } } } },
      judgingTasks: {
        select: {
          scores: {
            select: { teamId: true, score: true, timeSeconds: true },
          },
        },
      },
    },
  });

  // teamId -> set of zone/event labels where this team placed within maxRank
  const teamWins = new Map<string, Set<string>>();

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

    const label = ec.event.zone?.name ?? ec.event.name;
    ranked.slice(0, maxRank).forEach(([teamId]) => {
      if (!teamWins.has(teamId)) teamWins.set(teamId, new Set());
      teamWins.get(teamId)!.add(label);
    });
  }

  const result = new Map<string, Set<string>>();
  if (teamWins.size === 0) return result;

  const members = await db.teamMember.findMany({
    where: { teamId: { in: [...teamWins.keys()] } },
    select: { participantId: true, teamId: true },
  });

  for (const m of members) {
    const labels = teamWins.get(m.teamId);
    if (!labels) continue;
    if (!result.has(m.participantId)) result.set(m.participantId, new Set());
    labels.forEach(l => result.get(m.participantId)!.add(l));
  }

  return result;
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
