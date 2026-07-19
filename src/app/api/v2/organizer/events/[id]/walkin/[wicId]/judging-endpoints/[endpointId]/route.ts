import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// PATCH — update label or status
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; wicId: string; endpointId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId, wicId, endpointId } = await params;
  const endpoint = await db.walkInJudgingEndpoint.findFirst({
    where: { id: endpointId, walkInCompetitionId: wicId, walkInCompetition: { eventId } },
  });
  if (!endpoint) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const { label, status } = await req.json().catch(() => ({}));
  const updated = await db.walkInJudgingEndpoint.update({
    where: { id: endpointId },
    data: {
      ...(label !== undefined && { label: label?.trim() || null }),
      ...(status !== undefined && { status }),
    },
    select: {
      id: true, routeSlug: true, passcode: true, label: true, status: true, createdAt: true,
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
  const endpoint = await db.walkInJudgingEndpoint.findFirst({
    where: { id: endpointId, walkInCompetitionId: wicId, walkInCompetition: { eventId } },
  });
  if (!endpoint) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await db.walkInJudgingEndpoint.delete({ where: { id: endpointId } });
  return NextResponse.json({ success: true });
}
