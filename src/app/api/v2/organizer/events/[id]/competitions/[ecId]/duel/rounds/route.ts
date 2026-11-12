import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { drawSessions, leagueQualifiers, leagueTables, nextKnockout, seedKnockout, sessionLetter, type DuelSplit } from "@/lib/duel";
import { DUEL_CONFIG_ROLES, asDrawTeam, duelErr, duelGuard, duelPool, groupKeyOf, loadRounds } from "@/lib/duel-server";

type Params = { params: Promise<{ id: string; ecId: string }> };

// POST { groupKey?, teamIds?, split, noSameContingent, noSameState } — draw a round.
// Under STATE scope `groupKey` is the state whose bracket is drawn ("" = no state).
// Round 1 draws the attended teams, or exactly `teamIds` (which may include
// registered teams not yet present, to draw before attendance); later rounds draw
// the teams that advanced from the round before. Drawing again while the latest
// round is a draft replaces that draft.
//
// LEAGUE format: round 1 draws the groups (sessions of `groupSize`, confirmed
// into round-robin matches); round 2 is the seeded knockout of the group
// qualifiers (`qualifiers` overrides who, e.g. to settle a tie at the cut);
// later rounds pair the winners in bracket order.
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
  const league = cfg.format === "LEAGUE" || rounds.some(r => r.stage === "GROUP");
  const pickPool = async () => {
    const pool = await duelPool(ec.eventId, ec.competitionId, ec.id);
    const pick = Array.isArray(body.teamIds) ? new Set<string>(body.teamIds) : null;
    const inGroup = pool.filter(t => groupKeyOf(cfg.scope, t) === groupKey);
    // Picked teams may include registered teams not yet present; by default only attended ones.
    return pick ? inGroup.filter(t => pick.has(t.id)) : inGroup.filter(t => t.attended);
  };

  let sessions: string[][], clashes: ReturnType<typeof drawSessions>["clashes"] = [];
  let stage = "ROUND";
  const pools: (string | null)[] = [];
  const labels: string[] = [];

  if (league && number === 1) {
    const entrants = await pickPool();
    if (entrants.length < 3) return duelErr("TOO_FEW", "Liga kumpulan perlu sekurang-kurangnya 3 pasukan.");
    ({ sessions, clashes } = drawSessions(entrants.map(asDrawTeam), { perSession: cfg.groupSize, split: "even", noSameContingent, noSameState }));
    if (sessions.some(x => x.length < 2)) return duelErr("GROUP_TOO_SMALL", "Setiap kumpulan perlu sekurang-kurangnya 2 pasukan.");
    stage = "GROUP";
    sessions.forEach((_, i) => { pools.push(sessionLetter(i)); labels.push(sessionLetter(i)); });
  } else if (league) {
    const prev = rounds.find(r => r.number === number - 1)!;
    if (prev.stage === "GROUP") {
      const tables = leagueTables(prev);
      const { qualifiers } = leagueQualifiers(tables, cfg.groupAdvance);
      let seeded = qualifiers.map(q => ({ teamId: q.teamId, pool: q.pool }));
      if (Array.isArray(body.qualifiers)) {
        // Hand-picked (ties at the cut): keep the standings' seeding order.
        const want = new Set<string>(body.qualifiers.map(String));
        const all = tables.flatMap(t => t.rows)
          .sort((a, b) => a.position - b.position || b.points - a.points || b.won - a.won || a.pool.localeCompare(b.pool, undefined, { numeric: true }));
        seeded = all.filter(r => want.has(r.teamId)).map(r => ({ teamId: r.teamId, pool: r.pool }));
      }
      if (seeded.length < 2) return duelErr("TOO_FEW", "Perlu sekurang-kurangnya 2 pasukan layak ke kalah mati.");
      sessions = seedKnockout(seeded);
    } else {
      sessions = nextKnockout(prev.sessions);
    }
    sessions.forEach((_, i) => { pools.push(null); labels.push(`M${i + 1}`); });
  } else {
    const entrants = number === 1 ? await pickPool()
      : rounds.find(r => r.number === number - 1)!.sessions.flatMap(s => s.entries.filter(e => e.advanced).map(e => e.team));
    if (entrants.length < 2) return duelErr("TOO_FEW", "Perlu sekurang-kurangnya 2 pasukan untuk cabutan.");
    ({ sessions, clashes } = drawSessions(entrants.map(asDrawTeam), { perSession: cfg.perSession, split, noSameContingent, noSameState }));
    sessions.forEach((_, i) => { pools.push(null); labels.push(sessionLetter(i)); });
  }
  if (sessions.flat().length < 2) return duelErr("TOO_FEW", "Perlu sekurang-kurangnya 2 pasukan untuk cabutan.");
  const isFinal = stage !== "GROUP" && sessions.length === 1;

  const round = await db.$transaction(async tx => {
    if (last?.status === "DRAFT") await tx.duelRound.delete({ where: { id: last.id } });
    return tx.duelRound.create({
      data: {
        eventCompetitionId: ec.id, groupKey, number, stage, isFinal,
        split: stage === "GROUP" ? "even" : split, noSameContingent, noSameState,
        sessions: {
          create: sessions.map((ids, i) => ({
            // League finals keep "M1" so the round still reads as a knockout match.
            number: i + 1, label: isFinal && !league ? "Akhir" : labels[i], pool: pools[i],
            entries: { create: ids.map((teamId, slot) => ({ teamId, slot })) },
          })),
        },
      },
      select: { id: true },
    });
  });
  return NextResponse.json({ roundId: round.id, clashes }, { status: 201 });
}
