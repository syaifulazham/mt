import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taskLockMap } from "@/lib/judgingStatus";

export const dynamic = "force-dynamic";

/**
 * GET /api/walkin-judging/[slug]/status — the endpoint's lock state, nationally
 * (`judging`) and per state (`locks.states`), polled by every open walk-in
 * judging page. Carries no scores or participant data, so no passcode; the
 * slug is an unguessable 20-hex-character id.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const endpoint = await db.walkInJudgingEndpoint.findUnique({
    where:  { routeSlug: slug },
    select: { id: true, status: true, completedAt: true, walkInCompetition: { select: { id: true, judgingStatus: true } } },
  });
  if (!endpoint) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const locks = await taskLockMap("walkin", endpoint, endpoint.walkInCompetition.id, endpoint.walkInCompetition.judgingStatus);
  return NextResponse.json(
    { taskStatus: endpoint.status, judging: locks.national, locks },
    { headers: { "Cache-Control": "no-store" } },
  );
}
