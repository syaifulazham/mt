import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { completeIfAllTasksDone, taskLockMap } from "@/lib/judgingStatus";

/**
 * POST /api/walkin-judging/[slug]/complete  body: { passcode, stateId? }
 *
 * The judge announces their walk-in endpoint complete — for every participant
 * (no stateId, "Kebangsaan") or only one state's. When it was the last ACTIVE
 * endpoint still open (nationally, or for that state), the walk-in
 * competition's national row / that state's row moves to COMPLETED, awaiting
 * Super Admin verification. Same rules as /api/judging/[slug]/complete.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { passcode, stateId } = await req.json().catch(() => ({})) as { passcode?: string; stateId?: string | null };
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
  if (stateId) {
    if (!(await db.state.findUnique({ where: { id: stateId }, select: { id: true } })))
      return NextResponse.json({ error: "INVALID_STATE_ID" }, { status: 400 });
    await db.judgingTaskStateCompletion.upsert({
      where:  { scope_taskId_stateId: { scope: "walkin", taskId: endpoint.id, stateId } },
      create: { scope: "walkin", taskId: endpoint.id, stateId },
      update: {},
    });
  } else {
    await db.walkInJudgingEndpoint.updateMany({ where: { id: endpoint.id, completedAt: null }, data: { completedAt: new Date() } });
  }
  await completeIfAllTasksDone("walkin", endpoint.walkInCompetitionId, stateId);

  const fresh = await db.walkInJudgingEndpoint.findUnique({
    where: { id: endpoint.id }, select: { id: true, completedAt: true, walkInCompetition: { select: { judgingStatus: true } } },
  });
  const locks = await taskLockMap("walkin", fresh!, endpoint.walkInCompetitionId, fresh!.walkInCompetition.judgingStatus);
  return NextResponse.json({ judging: locks.national, locks });
}
