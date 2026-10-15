import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { announcementBoard, type AnnounceItem } from "@/lib/announcements";

export const dynamic = "force-dynamic";

/**
 * POST /api/announce/[slug]  body: { passcode }
 * The announcer (MC) board: the announcement list in the Super Admin's order
 * (green-lit results with their rankings), waiting and announced results.
 * Polled by the board page.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { passcode } = await req.json().catch(() => ({})) as { passcode?: string };
  if (!passcode) return NextResponse.json({ error: "MISSING_PASSCODE" }, { status: 400 });

  const endpoint = await db.announcementEndpoint.findUnique({
    where:   { routeSlug: slug },
    include: { event: { select: { id: true, name: true, scope: true } } },
  });
  if (!endpoint) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (endpoint.passcode !== passcode.trim().toUpperCase())
    return NextResponse.json({ error: "WRONG_PASSCODE" }, { status: 401 });
  if (endpoint.status === "CLOSED") return NextResponse.json({ error: "ENDPOINT_CLOSED" }, { status: 403 });

  // What the MC reads out: for green-lit (and already announced) results only,
  // so a board can't read ahead of the Super Admin's go-ahead, and only places
  // 1..maxPlaces (configuration) — team, contingent and state; no member names
  // or scores, and nothing below the announced places leaves the server.
  const board = await announcementBoard(endpoint.eventId, { withRankings: true });
  const forMc = (i: AnnounceItem, show: boolean): AnnounceItem => ({
    ...i,
    rankings: show
      ? (i.rankings ?? []).filter(r => r.rank <= board.maxPlaces)
          .map(r => ({ ...r, members: [], totalScore: 0, bestTime: null }))
      : [],
  });
  board.list = board.list.map(i => forMc(i, i.greenLight));
  board.announced = board.announced.map(i => forMc(i, true));
  return NextResponse.json(
    {
      endpoint: { id: endpoint.id, label: endpoint.label },
      event: endpoint.event,
      board,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
