import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DUEL_CONFIG_ROLES, duelErr, duelGuard } from "@/lib/duel-server";

type Params = { params: Promise<{ id: string; ecId: string; rid: string }> };

async function draftRound(ecId: string, rid: string) {
  return db.duelRound.findFirst({
    where: { id: rid, eventCompetitionId: ecId },
    select: { id: true, status: true, sessions: { orderBy: { number: "asc" }, select: { id: true, entries: { select: { teamId: true } } } } },
  });
}

// PATCH { sessions: string[][] } — save a draft's arrangement after manual
// swaps/moves: same teams, same number of sessions, none empty or over size.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, ecId, rid } = await params;
  const g = await duelGuard(id, ecId, DUEL_CONFIG_ROLES);
  if ("res" in g) return g.res;
  const round = await draftRound(ecId, rid);
  if (!round) return duelErr("NOT_FOUND", "Pusingan tidak dijumpai.", 404);
  if (round.status !== "DRAFT") return duelErr("LOCKED", "Pusingan sudah disahkan dan dikunci.", 409);

  const body = await req.json().catch(() => ({}));
  const next: string[][] = Array.isArray(body.sessions) ? body.sessions.map((s: unknown) => (Array.isArray(s) ? s.map(String) : [])) : [];
  const before = round.sessions.flatMap(s => s.entries.map(e => e.teamId)).sort();
  const after = next.flat().sort();
  if (next.length !== round.sessions.length || before.join() !== after.join())
    return duelErr("MISMATCH", "Susunan tidak sepadan dengan cabutan — muat semula halaman.", 409);
  if (next.some(s => s.length === 0)) return duelErr("EMPTY_SESSION", "Setiap sesi perlu sekurang-kurangnya satu pasukan.");
  if (next.some(s => s.length > g.cfg.perSession)) return duelErr("SESSION_FULL", `Maksimum ${g.cfg.perSession} pasukan satu sesi.`);

  await db.$transaction([
    db.duelEntry.deleteMany({ where: { sessionId: { in: round.sessions.map(s => s.id) } } }),
    ...round.sessions.map((s, i) => db.duelEntry.createMany({
      data: next[i].map((teamId, slot) => ({ sessionId: s.id, teamId, slot })),
    })),
  ]);
  return NextResponse.json({ ok: true });
}

// DELETE — discard a draft round.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, ecId, rid } = await params;
  const g = await duelGuard(id, ecId, DUEL_CONFIG_ROLES);
  if ("res" in g) return g.res;
  const round = await draftRound(ecId, rid);
  if (!round) return duelErr("NOT_FOUND", "Pusingan tidak dijumpai.", 404);
  if (round.status !== "DRAFT") return duelErr("LOCKED", "Pusingan sudah disahkan dan dikunci.", 409);
  await db.duelRound.delete({ where: { id: rid } });
  return NextResponse.json({ ok: true });
}
