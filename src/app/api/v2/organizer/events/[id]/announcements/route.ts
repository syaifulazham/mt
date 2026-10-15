import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { announcementBoard, reorderAnnouncements, setAnnounced, setGreenLight, setMaxPlaces } from "@/lib/announcements";

export const dynamic = "force-dynamic";

// GET — the event's announcement list, waiting and announced results (no
// rankings), polled by the Pengumuman page
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(await announcementBoard(eventId), { headers: { "Cache-Control": "no-store" } });
}

/**
 * PATCH — manage the announcement list (Super Admin only). Body by action:
 *   { action: "greenLight", kind, refId, stateId?, on }      green light a verified result / withdraw it
 *   { action: "reorder", keys: announceKey[] }               save the list's order (drag-and-drop)
 *   { action: "announce", kind, refId, stateId?, announced } correct an announced mark
 *   { action: "config", maxPlaces }                         places announced per result (1–20)
 * Returns the updated board.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({})) as {
    action?: string; kind?: string; refId?: string; stateId?: string | null;
    on?: boolean; announced?: boolean; keys?: string[]; maxPlaces?: number;
  };
  const by = session.name || session.email || "Super Admin";

  let r: { status: number; error?: string };
  if (body.action === "config") {
    r = await setMaxPlaces(eventId, body.maxPlaces);
  } else if (body.action === "reorder") {
    if (!Array.isArray(body.keys)) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    r = await reorderAnnouncements(eventId, body.keys);
  } else {
    if (!body.kind || !body.refId) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    const ref = { kind: body.kind, refId: body.refId, stateId: body.stateId ?? null };
    if (body.action === "greenLight" && typeof body.on === "boolean")
      r = await setGreenLight(eventId, ref, body.on, by);
    else if (typeof body.announced === "boolean")
      r = await setAnnounced(eventId, ref.kind, ref.refId, ref.stateId, body.announced, `Organizer: ${by}`);
    else return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  }
  return r.error
    ? NextResponse.json({ error: r.error }, { status: r.status })
    : NextResponse.json(await announcementBoard(eventId));
}
