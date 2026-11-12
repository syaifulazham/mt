import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leagueFixtures, scheduleRound } from "@/lib/duel";
import { DUEL_CONFIG_ROLES, duelErr, duelGuard } from "@/lib/duel-server";

type Params = { params: Promise<{ id: string; ecId: string; rid: string }> };

const loadRound = (ecId: string, rid: string) => db.duelRound.findFirst({
  where: { id: rid, eventCompetitionId: ecId },
  select: {
    id: true, groupKey: true, number: true, stage: true, status: true, isFinal: true,
    sessions: {
      orderBy: { number: "asc" },
      select: { id: true, label: true, pool: true, startedAt: true, entries: { orderBy: { slot: "asc" }, select: { id: true, teamId: true } } },
    },
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

  // Arenas are shared with the other brackets (STATE scope): queue behind their unfinished sessions.
  const busy = await db.duelSession.groupBy({
    by: ["arena"], _count: true,
    where: { status: { not: "DONE" }, arena: { gt: 0 }, round: { eventCompetitionId: ecId, status: "CONFIRMED", id: { not: rid } } },
  });
  const queued = Array.from({ length: g.cfg.arenas }, (_, i) => busy.find(b => b.arena === i + 1)?._count ?? 0);
  const confirmedBy = g.session.name || g.session.email;

  if (round.stage === "GROUP") {
    // The draft's sessions are the groups: replace them with every group's
    // round-robin matches, matchday by matchday, and schedule those.
    const matches = leagueFixtures(round.sessions.map(s => ({ label: s.pool ?? s.label, teamIds: s.entries.map(e => e.teamId) })));
    const slots = scheduleRound(matches.length, g.cfg, startAt, queued);
    await db.$transaction([
      db.duelSession.deleteMany({ where: { roundId: rid } }),
      ...matches.map((m, i) => db.duelSession.create({
        data: {
          roundId: rid, number: i + 1, label: m.label, pool: m.pool, ...slots[i], status: "PENDING",
          entries: { create: m.teamIds.map((teamId, slot) => ({ teamId, slot })) },
        },
      })),
      db.duelRound.update({ where: { id: rid }, data: { status: "CONFIRMED", startAt, confirmedAt: new Date(), confirmedBy } }),
    ]);
    console.warn(`[duel] ${confirmedBy} confirmed the group stage of ${ecId} (${matches.length} matches)`);
    return NextResponse.json({ ok: true, matches: matches.length });
  }

  // Byes take no arena slot.
  const playing = round.sessions.filter(s => s.entries.length > 1);
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
      data: { status: playing.length ? "CONFIRMED" : "DONE", startAt, confirmedAt: now, confirmedBy },
    }),
  ]);
  console.warn(`[duel] ${confirmedBy} confirmed round ${round.number} of ${ecId}`);
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
  if (round.stage === "GROUP") {
    // Fold the matches back into the groups they came from.
    const groups = new Map<string, string[]>();
    for (const s of round.sessions) {
      const k = s.pool ?? s.label;
      const list = groups.get(k) ?? [];
      for (const e of s.entries) if (!list.includes(e.teamId)) list.push(e.teamId);
      groups.set(k, list);
    }
    const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
    await db.$transaction([
      db.duelSession.deleteMany({ where: { roundId: rid } }),
      ...sorted.map(([label, teamIds], i) => db.duelSession.create({
        data: { roundId: rid, number: i + 1, label, pool: label, entries: { create: teamIds.map((teamId, slot) => ({ teamId, slot })) } },
      })),
      db.duelRound.update({ where: { id: rid }, data: { status: "DRAFT", startAt: null, confirmedAt: null, confirmedBy: null } }),
    ]);
    return NextResponse.json({ ok: true });
  }
  await db.$transaction([
    db.duelSession.updateMany({ where: { id: { in: ids } }, data: { status: "PENDING", scheduledAt: null, startedAt: null, pausedAt: null, pausedMs: 0, endedAt: null } }),
    db.duelEntry.updateMany({ where: { sessionId: { in: ids } }, data: { rank: null, points: null, advanced: false } }),
    db.duelRound.update({ where: { id: rid }, data: { status: "DRAFT", confirmedAt: null, confirmedBy: null } }),
  ]);
  return NextResponse.json({ ok: true });
}
