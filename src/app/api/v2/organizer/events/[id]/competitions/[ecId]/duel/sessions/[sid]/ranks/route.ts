import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pointsFor } from "@/lib/duel";
import { DUEL_CONTROL_ROLES, duelErr, duelGuard, loadDuelSession } from "@/lib/duel-server";

type Params = { params: Promise<{ id: string; ecId: string; sid: string }> };

// POST { ranks: { [teamId]: rank } } — the session's finishing order, 1…n,
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

  const { ranks } = await req.json().catch(() => ({}));
  const n = s.entries.length;
  const got = s.entries.map(e => Number(ranks?.[e.teamId]));
  if (got.some(r => !Number.isInteger(r) || r < 1 || r > n) || new Set(got).size !== n)
    return duelErr("BAD_RANKS", `Beri setiap pasukan kedudukan 1 hingga ${n}, sekali sahaja.`);

  const now = new Date();
  await db.$transaction(async tx => {
    if (later) await tx.duelRound.delete({ where: { id: later.id } });
    for (const [i, e] of s.entries.entries()) {
      const rank = got[i];
      await tx.duelEntry.update({
        where: { id: e.id },
        data: { rank, points: pointsFor(rank, n), advanced: !s.round.isFinal && rank <= g.cfg.advance },
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
