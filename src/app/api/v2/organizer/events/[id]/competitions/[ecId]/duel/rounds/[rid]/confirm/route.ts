import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduleRound } from "@/lib/duel";
import { DUEL_CONFIG_ROLES, duelErr, duelGuard } from "@/lib/duel-server";

type Params = { params: Promise<{ id: string; ecId: string; rid: string }> };

const loadRound = (ecId: string, rid: string) => db.duelRound.findFirst({
  where: { id: rid, eventCompetitionId: ecId },
  select: {
    id: true, groupKey: true, number: true, status: true, isFinal: true,
    sessions: { orderBy: { number: "asc" }, select: { id: true, startedAt: true, entries: { select: { id: true } } } },
  },
});

// POST { startAt? } — lock the draft: arenas, waves and estimated times are
// assigned, and a session of one (a bye) is completed with that team advancing.
export async function POST(req: NextRequest, { params }: Params) {
  const { id, ecId, rid } = await params;
  const g = await duelGuard(id, ecId, DUEL_CONFIG_ROLES);
  if ("res" in g) return g.res;
  const round = await loadRound(ecId, rid);
  if (!round) return duelErr("NOT_FOUND", "Pusingan tidak dijumpai.", 404);
  if (round.status !== "DRAFT") return duelErr("LOCKED", "Pusingan sudah disahkan.", 409);
  if (g.ec.judgingMethod !== "DUEL") return duelErr("NOT_DUEL", "Pertandingan ini bukan kaedah Duel.");

  const body = await req.json().catch(() => ({}));
  const startAt = body.startAt ? new Date(body.startAt) : null;
  if (startAt && isNaN(startAt.getTime())) return duelErr("INVALID_START", "Masa mula tidak sah.");

  // Byes take no arena slot.
  const playing = round.sessions.filter(s => s.entries.length > 1);
  // Arenas are shared with the other brackets (STATE scope): queue behind their unfinished sessions.
  const busy = await db.duelSession.groupBy({
    by: ["arena"], _count: true,
    where: { status: { not: "DONE" }, arena: { gt: 0 }, round: { eventCompetitionId: ecId, status: "CONFIRMED", id: { not: rid } } },
  });
  const queued = Array.from({ length: g.cfg.arenas }, (_, i) => busy.find(b => b.arena === i + 1)?._count ?? 0);
  const slots = scheduleRound(playing.length, g.cfg, startAt, queued);
  const now = new Date();
  const byes = round.sessions.filter(s => s.entries.length === 1);

  await db.$transaction([
    ...playing.map((s, i) => db.duelSession.update({ where: { id: s.id }, data: { ...slots[i], status: "PENDING" } })),
    ...byes.flatMap(s => [
      db.duelSession.update({ where: { id: s.id }, data: { arena: 0, wave: 0, scheduledAt: null, status: "DONE", endedAt: now } }),
      db.duelEntry.update({ where: { id: s.entries[0].id }, data: { rank: 1, points: 1, advanced: !round.isFinal } }),
    ]),
    db.duelRound.update({
      where: { id: rid },
      data: { status: playing.length ? "CONFIRMED" : "DONE", startAt, confirmedAt: now, confirmedBy: g.session.name || g.session.email },
    }),
  ]);
  console.warn(`[duel] ${g.session.name || g.session.email} confirmed round ${round.number} of ${ecId}`);
  return NextResponse.json({ ok: true });
}

// DELETE — Super Admin reopens a confirmed round as a draft, only while no
// session has started and no later round exists.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, ecId, rid } = await params;
  const g = await duelGuard(id, ecId, ["SUPER_ADMIN"]);
  if ("res" in g) return g.res;
  const round = await loadRound(ecId, rid);
  if (!round) return duelErr("NOT_FOUND", "Pusingan tidak dijumpai.", 404);
  if (round.status === "DRAFT") return NextResponse.json({ ok: true });
  if (round.sessions.some(s => s.startedAt)) return duelErr("STARTED", "Sesi sudah bermula — pusingan tidak boleh dibuka semula.", 409);
  const later = await db.duelRound.count({ where: { eventCompetitionId: ecId, groupKey: round.groupKey, number: { gt: round.number } } });
  if (later) return duelErr("LATER_ROUND", "Pusingan seterusnya sudah wujud.", 409);

  const ids = round.sessions.map(s => s.id);
  await db.$transaction([
    db.duelSession.updateMany({ where: { id: { in: ids } }, data: { status: "PENDING", scheduledAt: null, startedAt: null, pausedAt: null, pausedMs: 0, endedAt: null } }),
    db.duelEntry.updateMany({ where: { sessionId: { in: ids } }, data: { rank: null, points: null, advanced: false } }),
    db.duelRound.update({ where: { id: rid }, data: { status: "DRAFT", confirmedAt: null, confirmedBy: null } }),
  ]);
  return NextResponse.json({ ok: true });
}
