import { NextRequest, NextResponse } from "next/server";
import { parseSharedRankMode } from "@/lib/sharedRank";
import { duelGroups, duelGuard, duelPool, loadRounds, standingsByGroup, withClock } from "@/lib/duel-server";

type Params = { params: Promise<{ id: string; ecId: string }> };

// GET — the duel manager's whole state (polled).
export async function GET(_req: NextRequest, { params }: Params) {
  const { id, ecId } = await params;
  const g = await duelGuard(id, ecId);
  if ("res" in g) return g.res;
  const { ec, cfg, session } = g;
  const [pool, rounds] = await Promise.all([duelPool(ec.eventId, ec.competitionId), loadRounds(ec.id)]);
  const now = Date.now();
  return NextResponse.json({
    ec: { id: ec.id, judgingMethod: ec.judgingMethod, competition: ec.competition, event: ec.event },
    config: cfg,
    role: session.role,
    pool,
    groups: duelGroups(cfg.scope, pool, rounds),
    rounds: rounds.map(r => ({ ...r, sessions: r.sessions.map(s => withClock(s, cfg.durationSec, now)) })),
    standings: standingsByGroup(rounds, parseSharedRankMode(ec.event.sharedRankMode)),
    serverNow: now,
  });
}
