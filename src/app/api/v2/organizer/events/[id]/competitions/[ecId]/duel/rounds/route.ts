import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { drawSessions, sessionLetter, type DuelSplit } from "@/lib/duel";
import { DUEL_CONFIG_ROLES, asDrawTeam, duelErr, duelGuard, duelPool, groupKeyOf, loadRounds, type DuelTeam } from "@/lib/duel-server";

type Params = { params: Promise<{ id: string; ecId: string }> };

// POST { groupKey?, teamIds?, split, noSameContingent, noSameState } — draw a round.
// Under STATE scope `groupKey` is the state whose bracket is drawn ("" = no state).
// Round 1 draws from the attended pool (teamIds narrows it); later rounds draw
// the teams that advanced from the round before. Drawing again while the latest
// round is a draft replaces that draft.
export async function POST(req: NextRequest, { params }: Params) {
  const { id, ecId } = await params;
  const g = await duelGuard(id, ecId, DUEL_CONFIG_ROLES);
  if ("res" in g) return g.res;
  const { ec, cfg } = g;
  if (ec.judgingMethod !== "DUEL") return duelErr("NOT_DUEL", "Pertandingan ini bukan kaedah Duel.");

  const body = await req.json().catch(() => ({}));
  const split: DuelSplit = body.split === "fill" ? "fill" : "even";
  const noSameContingent = !!body.noSameContingent, noSameState = !!body.noSameState;

  const groupKey = cfg.scope === "STATE" && typeof body.groupKey === "string" ? body.groupKey : "";
  const rounds = (await loadRounds(ec.id)).filter(r => r.groupKey === groupKey);
  const last = rounds[rounds.length - 1];
  if (last?.status === "CONFIRMED") return duelErr("ROUND_IN_PROGRESS", `Pusingan ${last.number} sedang berjalan — selesaikan semua sesi dahulu.`, 409);
  if (last?.isFinal && last.status === "DONE") return duelErr("FINISHED", "Pusingan akhir sudah selesai.", 409);

  const number = last?.status === "DRAFT" ? last.number : (last?.number ?? 0) + 1;
  let entrants: DuelTeam[];
  if (number === 1) {
    const pool = await duelPool(ec.eventId, ec.competitionId);
    const pick = Array.isArray(body.teamIds) ? new Set<string>(body.teamIds) : null;
    const inGroup = pool.filter(t => groupKeyOf(cfg.scope, t) === groupKey);
    entrants = pick ? inGroup.filter(t => pick.has(t.id)) : inGroup;
  } else {
    const prev = rounds.find(r => r.number === number - 1)!;
    entrants = prev.sessions.flatMap(s => s.entries.filter(e => e.advanced).map(e => e.team));
  }
  if (entrants.length < 2) return duelErr("TOO_FEW", "Perlu sekurang-kurangnya 2 pasukan untuk cabutan.");

  const { sessions, clashes } = drawSessions(entrants.map(asDrawTeam), {
    perSession: cfg.perSession, split, noSameContingent, noSameState,
  });
  const isFinal = sessions.length === 1;

  const round = await db.$transaction(async tx => {
    if (last?.status === "DRAFT") await tx.duelRound.delete({ where: { id: last.id } });
    return tx.duelRound.create({
      data: {
        eventCompetitionId: ec.id, groupKey, number, isFinal, split, noSameContingent, noSameState,
        sessions: {
          create: sessions.map((ids, i) => ({
            number: i + 1, label: isFinal ? "Akhir" : sessionLetter(i),
            entries: { create: ids.map((teamId, slot) => ({ teamId, slot })) },
          })),
        },
      },
      select: { id: true },
    });
  });
  return NextResponse.json({ roundId: round.id, clashes }, { status: 201 });
}
