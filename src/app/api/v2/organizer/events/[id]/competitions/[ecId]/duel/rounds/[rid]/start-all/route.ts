import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DUEL_CONTROL_ROLES, duelErr, duelGuard } from "@/lib/duel-server";

type Params = { params: Promise<{ id: string; ecId: string; rid: string }> };

const ACTIVE = ["RUNNING", "PAUSED", "ENDED"];

// POST — Mula semua: start every arena's next session of this round at the
// same instant. An arena's session is the one in play (running, paused or
// awaiting ranks) or else its next pending one in wave order — as the arena
// cards show. Arenas with one in play, or busy with another bracket, are skipped.
export async function POST(_req: NextRequest, { params }: Params) {
  const { id, ecId, rid } = await params;
  const g = await duelGuard(id, ecId, DUEL_CONTROL_ROLES);
  if ("res" in g) return g.res;
  const round = await db.duelRound.findFirst({
    where: { id: rid, eventCompetitionId: ecId },
    select: { status: true, sessions: { where: { arena: { gt: 0 } }, select: { id: true, arena: true, wave: true, number: true, status: true } } },
  });
  if (!round) return duelErr("NOT_FOUND", "Pusingan tidak dijumpai.", 404);
  if (round.status !== "CONFIRMED") return duelErr("NOT_CONFIRMED", round.status === "DRAFT" ? "Sahkan cabutan dahulu." : "Pusingan sudah selesai.", 409);

  // Arenas running a session of another round / bracket of this competition.
  const busy = new Set((await db.duelSession.findMany({
    where: { status: { in: ["RUNNING", "PAUSED"] }, roundId: { not: rid }, round: { eventCompetitionId: ecId } }, select: { arena: true },
  })).map(s => s.arena));

  const toStart: string[] = [];
  const arenas = [...new Set(round.sessions.map(s => s.arena))].sort((a, b) => a - b);
  for (const a of arenas) {
    const list = round.sessions.filter(s => s.arena === a).sort((x, y) => x.wave - y.wave || x.number - y.number);
    const current = list.find(s => ACTIVE.includes(s.status)) ?? list.find(s => s.status === "PENDING");
    if (current?.status === "PENDING" && !busy.has(a)) toStart.push(current.id);
  }
  if (!toStart.length) return duelErr("NOTHING_TO_START", "Tiada arena yang sedia untuk dimulakan.", 409);
  const now = new Date();
  await db.duelSession.updateMany({
    where: { id: { in: toStart }, status: "PENDING" },
    data: { status: "RUNNING", startedAt: now, pausedAt: null, pausedMs: 0, endedAt: null },
  });
  return NextResponse.json({ started: toStart.length });
}
