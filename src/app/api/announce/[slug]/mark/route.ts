import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setAnnounced } from "@/lib/announcements";

/**
 * POST /api/announce/[slug]/mark  body: { passcode, kind, refId, stateId?, announced }
 * The announcer ticks (or unticks) a result as announced. Only results the
 * Super Admin green-lit can be ticked; marks are event-wide, so every
 * announcer board and the Pengumuman page see them.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { passcode, kind, refId, stateId, announced } = await req.json().catch(() => ({})) as {
    passcode?: string; kind?: string; refId?: string; stateId?: string | null; announced?: boolean;
  };
  if (!passcode || !kind || !refId || typeof announced !== "boolean")
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const endpoint = await db.announcementEndpoint.findUnique({ where: { routeSlug: slug } });
  if (!endpoint) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (endpoint.passcode !== passcode.trim().toUpperCase())
    return NextResponse.json({ error: "WRONG_PASSCODE" }, { status: 401 });
  if (endpoint.status === "CLOSED") return NextResponse.json({ error: "ENDPOINT_CLOSED" }, { status: 403 });

  const r = await setAnnounced(endpoint.eventId, kind, refId, stateId ?? null, announced, endpoint.label ?? "Pengumuman", { requireGreenLight: true });
  return r.error
    ? NextResponse.json({ error: r.error }, { status: r.status })
    : NextResponse.json({ ok: true });
}
