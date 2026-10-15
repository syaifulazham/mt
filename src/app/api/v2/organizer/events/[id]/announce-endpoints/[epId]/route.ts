import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const SELECT = {
  id: true, routeSlug: true, passcode: true, label: true, status: true, createdAt: true,
} as const;

async function superAdminEndpoint(eventId: string, epId: string) {
  const session = await getOrganizerSession();
  if (!session) return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  if (session.role !== "SUPER_ADMIN") return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  const ep = await db.announcementEndpoint.findFirst({ where: { id: epId, eventId }, select: { id: true } });
  if (!ep) return { error: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }) };
  return { ep };
}

// PATCH { label?, status? } — rename, or open / close the board (Super Admin only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; epId: string }> }) {
  const { id: eventId, epId } = await params;
  const r = await superAdminEndpoint(eventId, epId);
  if (r.error) return r.error;

  const { label, status } = await req.json().catch(() => ({})) as { label?: string; status?: string };
  if (status !== undefined && status !== "ACTIVE" && status !== "CLOSED")
    return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });
  const updated = await db.announcementEndpoint.update({
    where: { id: epId },
    data: {
      ...(label !== undefined && { label: label.trim() || null }),
      ...(status !== undefined && { status }),
    },
    select: SELECT,
  });
  return NextResponse.json({ data: updated });
}

// DELETE — remove the board (Super Admin only). Announcement marks are event-wide and stay.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; epId: string }> }) {
  const { id: eventId, epId } = await params;
  const r = await superAdminEndpoint(eventId, epId);
  if (r.error) return r.error;
  await db.announcementEndpoint.delete({ where: { id: epId } });
  return NextResponse.json({ success: true });
}
