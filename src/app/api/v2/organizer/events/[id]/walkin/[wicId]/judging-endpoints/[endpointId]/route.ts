import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { JUDGING_LOCKED, judgingLocked, cleanupTaskStateCompletions } from "@/lib/judgingStatus";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// While the walk-in competition's judging is announced complete or verified,
// endpoints are frozen too: deleting one would delete its scores, and reopening
// one would let judging resume behind the announcement.
function findEndpoint(endpointId: string, wicId: string, eventId: string) {
  return db.walkInJudgingEndpoint.findFirst({
    where:   { id: endpointId, walkInCompetitionId: wicId, walkInCompetition: { eventId } },
    include: { walkInCompetition: { select: { judgingStatus: true } } },
  });
}

// PATCH — update label or status; { reopenCompletion: true } undoes the judge's
// "Penghakiman Selesai" for this endpoint (Super Admin only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; wicId: string; endpointId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId, wicId, endpointId } = await params;
  const endpoint = await findEndpoint(endpointId, wicId, eventId);
  if (!endpoint) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (judgingLocked(endpoint.walkInCompetition.judgingStatus)) return NextResponse.json(JUDGING_LOCKED, { status: 423 });

  const { label, status, reopenCompletion } = await req.json().catch(() => ({}));
  if (reopenCompletion && session.role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const updated = await db.walkInJudgingEndpoint.update({
    where: { id: endpointId },
    data: {
      ...(label !== undefined && { label: label?.trim() || null }),
      ...(status !== undefined && { status }),
      ...(reopenCompletion === true && { completedAt: null }),
    },
    select: {
      id: true, routeSlug: true, passcode: true, label: true, status: true, createdAt: true, completedAt: true,
      judgingTemplate: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json({ data: updated });
}

// DELETE
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; wicId: string; endpointId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId, wicId, endpointId } = await params;
  const endpoint = await findEndpoint(endpointId, wicId, eventId);
  if (!endpoint) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (judgingLocked(endpoint.walkInCompetition.judgingStatus)) return NextResponse.json(JUDGING_LOCKED, { status: 423 });

  await db.walkInJudgingEndpoint.delete({ where: { id: endpointId } });
  await cleanupTaskStateCompletions("walkin", endpointId);
  return NextResponse.json({ success: true });
}
