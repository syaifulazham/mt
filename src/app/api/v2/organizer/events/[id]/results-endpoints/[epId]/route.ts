import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ResultsEndpointStatus } from "@prisma/client";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// PATCH /api/v2/organizer/events/[id]/results-endpoints/[epId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; epId: string }> }
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId, epId } = await params;

  const existing = await db.resultsEndpoint.findFirst({
    where: { id: epId, eventId },
  });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json() as {
    label?: string;
    status?: ResultsEndpointStatus;
    competitionIds?: string[];
  };

  const updated = await db.resultsEndpoint.update({
    where: { id: epId },
    data: {
      ...(body.label !== undefined && { label: body.label?.trim() || null }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.competitionIds !== undefined && { competitionIds: body.competitionIds }),
    },
  });

  return NextResponse.json({ data: updated });
}

// DELETE /api/v2/organizer/events/[id]/results-endpoints/[epId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; epId: string }> }
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId, epId } = await params;

  const existing = await db.resultsEndpoint.findFirst({
    where: { id: epId, eventId },
  });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await db.resultsEndpoint.delete({ where: { id: epId } });
  return NextResponse.json({ success: true });
}
