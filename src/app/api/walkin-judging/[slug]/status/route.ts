import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taskJudgingState } from "@/lib/judgingStatus";

export const dynamic = "force-dynamic";

/**
 * GET /api/walkin-judging/[slug]/status — the endpoint's lock state, polled by
 * every open walk-in judging page. Carries no scores or participant data, so
 * no passcode; the slug is an unguessable 20-hex-character id.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const endpoint = await db.walkInJudgingEndpoint.findUnique({
    where:  { routeSlug: slug },
    select: { status: true, completedAt: true, walkInCompetition: { select: { judgingStatus: true } } },
  });
  if (!endpoint) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(
    { taskStatus: endpoint.status, judging: taskJudgingState(endpoint, endpoint.walkInCompetition.judgingStatus) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
