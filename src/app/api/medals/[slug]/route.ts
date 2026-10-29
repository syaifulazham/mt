import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeMedalTally } from "@/lib/medalTally";

export const dynamic = "force-dynamic";

// POST /api/medals/[slug] — public big-screen medal tally. Only competitions
// whose judging is VERIFIED are counted, so nothing unreleased leaves the server.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await req.json().catch(() => ({}))) as { passcode?: unknown };

  const endpoint = await db.medalTallyEndpoint.findUnique({
    where: { routeSlug: slug },
    include: { event: { select: { id: true, name: true, startDate: true, endDate: true } } },
  });
  if (!endpoint) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (endpoint.status === "CLOSED") return NextResponse.json({ error: "ENDPOINT_CLOSED" }, { status: 403 });

  if (endpoint.passcode) {
    const given = typeof body.passcode === "string" ? body.passcode.trim().toUpperCase() : "";
    if (!given) return NextResponse.json({ error: "PASSCODE_REQUIRED" }, { status: 401 });
    if (given !== endpoint.passcode) return NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 401 });
  }

  const tally = await computeMedalTally(endpoint.eventId);
  return NextResponse.json({
    label: endpoint.label,
    event: { name: endpoint.event.name, startDate: endpoint.event.startDate, endDate: endpoint.event.endDate },
    // Winner details stay on the organizer page; the screen shows counts only.
    states: tally.states.map(({ winners: _w, ...s }) => { void _w; return s; }),
    competitions: tally.competitions,
    updatedAt: new Date().toISOString(),
  });
}
