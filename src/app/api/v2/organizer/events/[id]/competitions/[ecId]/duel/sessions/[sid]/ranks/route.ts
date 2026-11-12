import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leaguePointsFor, pointsFor } from "@/lib/duel";
import { cleanTally, ranksMatchScores, scoreOf, type Tally } from "@/lib/duel-scorecard";
import { DUEL_CONTROL_ROLES, duelErr, duelGuard, loadDuelSession } from "@/lib/duel-server";

type Params = { params: Promise<{ id: string; ecId: string; sid: string }> };

// POST { ranks: { [teamId]: rank }, tallies?: { [teamId]: Tally } } — the session's finishing order, 1…n,
// with the scorecard marks when the competition uses one (the ranks must then
// follow the scores; only ties are settled by hand),
// each rank once. Points 1st = n … last = 1; ranks within `advance` go on to
// the next round. Correctable until the next round is confirmed; a draft next
// round is discarded since its entrants may change.
export async function POST(req: NextRequest, { params }: Params) {
  const { id, ecId, sid } = await params;
  const g = await duelGuard(id, ecId, DUEL_CONTROL_ROLES);
  if ("res" in g) return g.res;
  const s = await loadDuelSession(ecId, sid);
  if (!s) return duelErr("NOT_FOUND", "Sesi tidak dijumpai.", 404);
  if (s.round.status === "DRAFT") return duelErr("NOT_CONFIRMED", "Sahkan cabutan dahulu.", 409);
  if (s.status === "PENDING") return duelErr("NOT_STARTED", "Sesi belum bermula.", 409);

  const later = await db.duelRound.findFirst({
    where: { eventCompetitionId: ecId, groupKey: s.round.groupKey, number: s.round.number + 1 }, select: { id: true, status: true },
  });
  if (later && later.status !== "DRAFT") return duelErr("NEXT_CONFIRMED", "Pusingan seterusnya sudah disahkan — kedudukan dikunci.", 409);

  const { ranks, tallies } = await req.json().catch(() => ({}));
  const n = s.entries.length;
  const got = s.entries.map(e => Number(ranks?.[e.teamId]));
  // Group-stage match (league): win 3, draw 1, loss 0 — a draw is both ranked 1.
  const isGroup = s.round.stage === "GROUP";
  const draw = isGroup && n === 2 && got[0] === 1 && got[1] === 1;
  if (draw && !g.cfg.allowDraw) return duelErr("NO_DRAW", "Seri tidak dibenarkan — pilih pemenang.");
  if (!draw && (got.some(r => !Number.isInteger(r) || r < 1 || r > n) || new Set(got).size !== n))
    return duelErr("BAD_RANKS", n === 2 ? "Pilih pemenang perlawanan." : `Beri setiap pasukan kedudukan 1 hingga ${n}, sekali sahaja.`);

  // Scorecard: clean each team's marks, total them, and hold the ranks to the scores.
  const card = g.cfg.scorecard;
  const marks = new Map<string, { tally: Tally; score: number }>();
  if (card.enabled && tallies && typeof tallies === "object") {
    const scores: Record<string, ReturnType<typeof scoreOf>> = {};
    for (const e of s.entries) {
      const tally = cleanTally(card, (tallies as Record<string, unknown>)[e.teamId]);
      scores[e.teamId] = scoreOf(card, tally);
      marks.set(e.teamId, { tally, score: scores[e.teamId].total });
    }
    const byTeam = Object.fromEntries(s.entries.map((e, i) => [e.teamId, got[i]]));
    if (!ranksMatchScores(scores, byTeam)) return duelErr("RANKS_VS_SCORES", "Kedudukan tidak sepadan dengan markah kad skor.");
    if (draw && scores[s.entries[0].teamId].total !== scores[s.entries[1].teamId].total)
      return duelErr("RANKS_VS_SCORES", "Seri hanya apabila markah sama.");
  }

  const now = new Date();
  await db.$transaction(async tx => {
    if (later) await tx.duelRound.delete({ where: { id: later.id } });
    for (const [i, e] of s.entries.entries()) {
      const rank = got[i];
      const m = marks.get(e.teamId);
      await tx.duelEntry.update({
        where: { id: e.id },
        data: {
          ...(isGroup
            ? { rank, points: leaguePointsFor(rank, got), advanced: false }
            : { rank, points: pointsFor(rank, n), advanced: !s.round.isFinal && rank <= g.cfg.advance }),
          ...(m ? { tally: m.tally, score: m.score } : {}),
        },
      });
    }
    await tx.duelSession.update({
      where: { id: s.id },
      data: {
        status: "DONE", endedAt: s.endedAt ?? now, pausedAt: null,
        pausedMs: s.pausedAt ? s.pausedMs + (now.getTime() - s.pausedAt.getTime()) : s.pausedMs,
      },
    });
    const open = await tx.duelSession.count({ where: { roundId: s.round.id, status: { not: "DONE" } } });
    await tx.duelRound.update({ where: { id: s.round.id }, data: { status: open ? "CONFIRMED" : "DONE" } });
  });
  return NextResponse.json({ ok: true, discardedDraft: !!later });
}
