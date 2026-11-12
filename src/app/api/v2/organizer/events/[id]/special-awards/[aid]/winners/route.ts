import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { awardErr, awardGuard } from "@/lib/special-awards-api";

type Params = { params: Promise<{ id: string; aid: string }> };

// PUT { winners: [{ rank, teamId } | { rank, participantId }] } — the hand-picked
// winners of a CUSTOM award (replaces them all). Teams / participants must be
// entered in the event (and in the award's competition, when it has one).
export async function PUT(req: NextRequest, { params }: Params) {
  const { id, aid } = await params;
  const g = await awardGuard(id, true);
  if ("res" in g) return g.res;
  const award = await db.specialAward.findFirst({
    where: { id: aid, eventId: id },
    select: { id: true, method: true, recipientType: true, places: true, eventCompetition: { select: { competitionId: true } } },
  });
  if (!award) return awardErr("NOT_FOUND", "Anugerah tidak dijumpai.", 404);
  if (award.method === "TEMPLATE") return awardErr("TEMPLATE_AWARD", "Pemenang anugerah ini dikira daripada markah templat.");

  const body = await req.json().catch(() => ({}));
  const list = (Array.isArray(body.winners) ? body.winners : []) as Record<string, unknown>[];
  const individual = award.recipientType === "INDIVIDUAL";
  const rows = list.map(w => ({ rank: Number(w.rank ?? 1), id: String((individual ? w.participantId : w.teamId) ?? "") }));
  if (rows.some(r => !r.id || !Number.isInteger(r.rank) || r.rank < 1 || r.rank > award.places))
    return awardErr("INVALID_WINNER", `Setiap pemenang perlu tempat 1–${award.places}.`);
  if (new Set(rows.map(r => r.id)).size !== rows.length) return awardErr("DUPLICATE_WINNER", "Pemenang yang sama dipilih lebih sekali.");

  // In the event (and the award's competition): teams entered via team_events.
  const teamWhere = {
    teamEvents: { some: { eventId: id } },
    ...(award.eventCompetition ? { competitionId: award.eventCompetition.competitionId } : {}),
  };
  const ok = individual
    ? await db.participant.count({ where: { id: { in: rows.map(r => r.id) }, teamMembers: { some: { team: teamWhere } } } })
    : await db.team.count({ where: { id: { in: rows.map(r => r.id) }, ...teamWhere } });
  if (ok !== rows.length) return awardErr("NOT_ELIGIBLE", individual ? "Peserta tidak menyertai acara / pertandingan ini." : "Pasukan tidak menyertai acara / pertandingan ini.");

  await db.$transaction([
    db.specialAwardWinner.deleteMany({ where: { awardId: aid } }),
    db.specialAwardWinner.createMany({
      data: rows.map(r => ({ awardId: aid, rank: r.rank, ...(individual ? { participantId: r.id } : { teamId: r.id }) })),
    }),
  ]);
  return NextResponse.json({ ok: true, count: rows.length });
}
