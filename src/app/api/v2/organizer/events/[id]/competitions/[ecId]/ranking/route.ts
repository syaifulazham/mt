import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { computeCompetitionResults } from "@/lib/resultsRankings";

type Params = { params: Promise<{ id: string; ecId: string }> };

// GET — live ranking of a score-judged competition (Scoreboard), from every
// judging task's scores. Not gated on verification: organizers only.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, ecId } = await params;
  const ec = await db.eventCompetition.findFirst({ where: { id: ecId, eventId: id }, select: { id: true } });
  if (!ec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const [result] = await computeCompetitionResults(id, false, [ecId]);
  return NextResponse.json({ result: result ?? null, serverNow: Date.now() });
}
