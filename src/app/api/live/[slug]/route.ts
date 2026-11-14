import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isVibeBlocksError, loadScoreboard, ScoreboardUnavailable } from "@/lib/vb-scoreboard";

export const dynamic = "force-dynamic";

// POST /api/live/[slug] { passcode? } — public live scoreboard of a VibeBlocks
// walk-in competition. Names and contingents only; no IC or contact details.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await req.json().catch(() => ({}))) as { passcode?: unknown };

  const endpoint = await db.walkInScoreboardEndpoint.findUnique({
    where: { routeSlug: slug },
    select: { walkInCompetitionId: true, passcode: true, label: true, active: true },
  });
  if (!endpoint) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!endpoint.active) return NextResponse.json({ error: "ENDPOINT_CLOSED" }, { status: 403 });
  if (endpoint.passcode) {
    const given = typeof body.passcode === "string" ? body.passcode.trim().toUpperCase() : "";
    if (!given) return NextResponse.json({ error: "PASSCODE_REQUIRED" }, { status: 401 });
    if (given !== endpoint.passcode) return NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 401 });
  }

  try {
    const data = await loadScoreboard(endpoint.walkInCompetitionId);
    return NextResponse.json({ label: endpoint.label, ...data });
  } catch (e: unknown) {
    if (e instanceof ScoreboardUnavailable) return NextResponse.json({ error: "UNAVAILABLE", message: e.message }, { status: 409 });
    console.error("[live-board] leaderboard failed:", (e as Error).message, isVibeBlocksError(e) ? `status ${e.status} code ${e.code}` : "");
    return NextResponse.json({ error: "UPSTREAM", message: "Papan skor tidak dapat dikemas kini sekarang." }, { status: 502 });
  }
}
