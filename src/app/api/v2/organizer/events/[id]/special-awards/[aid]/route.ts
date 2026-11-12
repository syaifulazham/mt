import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { awardErr, awardGuard, parseAwardInput } from "@/lib/special-awards-api";

type Params = { params: Promise<{ id: string; aid: string }> };

// PATCH — edit an award (the whole form). Hand-picked winners that no longer
// fit (now ranked by template, or of the other recipient type / competition) are removed.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, aid } = await params;
  const g = await awardGuard(id, true);
  if ("res" in g) return g.res;
  const award = await db.specialAward.findFirst({ where: { id: aid, eventId: id }, select: { id: true, recipientType: true, eventCompetitionId: true } });
  if (!award) return awardErr("NOT_FOUND", "Anugerah tidak dijumpai.", 404);
  const parsed = await parseAwardInput(id, await req.json().catch(() => ({})));
  if ("res" in parsed) return parsed.res;
  const d = parsed.data;
  const dropWinners = d.method === "TEMPLATE" || d.recipientType !== award.recipientType || d.eventCompetitionId !== award.eventCompetitionId;
  await db.$transaction([
    ...(dropWinners ? [db.specialAwardWinner.deleteMany({ where: { awardId: aid } })] : []),
    db.specialAward.update({ where: { id: aid }, data: d }),
  ]);
  return NextResponse.json({ ok: true });
}

// DELETE — remove an award and its winners.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, aid } = await params;
  const g = await awardGuard(id, true);
  if ("res" in g) return g.res;
  const { count } = await db.specialAward.deleteMany({ where: { id: aid, eventId: id } });
  if (!count) return awardErr("NOT_FOUND", "Anugerah tidak dijumpai.", 404);
  return NextResponse.json({ ok: true });
}
