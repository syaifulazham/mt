import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { completeIfAllTasksDone, taskJudgingState } from "@/lib/judgingStatus";

/**
 * POST /api/walkin-judging/[slug]/complete  body: { passcode }
 *
 * The judge announces their walk-in endpoint complete: its form locks, and when
 * it was the competition's last ACTIVE endpoint still open, the walk-in
 * competition moves to COMPLETED (awaiting Super Admin verification). Same rules
 * as /api/judging/[slug]/complete; the typed 5-character code is a client-side
 * guard against an accidental click, the passcode authorises.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { passcode } = await req.json().catch(() => ({})) as { passcode?: string };
  if (!passcode) return NextResponse.json({ error: "MISSING_PASSCODE" }, { status: 400 });

  const endpoint = await db.walkInJudgingEndpoint.findUnique({
    where:  { routeSlug: slug },
    select: { id: true, status: true, passcode: true, walkInCompetitionId: true },
  });
  if (!endpoint) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (endpoint.passcode !== passcode.trim().toUpperCase())
    return NextResponse.json({ error: "WRONG_PASSCODE" }, { status: 401 });
  if (endpoint.status === "CLOSED") return NextResponse.json({ error: "TASK_CLOSED" }, { status: 403 });

  // Idempotent: a second click (or another device) keeps the first timestamp.
  await db.walkInJudgingEndpoint.updateMany({ where: { id: endpoint.id, completedAt: null }, data: { completedAt: new Date() } });
  const judgingStatus = await completeIfAllTasksDone("walkin", endpoint.walkInCompetitionId);

  const fresh = await db.walkInJudgingEndpoint.findUnique({ where: { id: endpoint.id }, select: { completedAt: true } });
  return NextResponse.json({ judging: taskJudgingState({ completedAt: fresh?.completedAt ?? new Date() }, judgingStatus) });
}
