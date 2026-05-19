import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

const EC_INCLUDE = {
  competition: {
    include: {
      theme:        { select: { id: true, name: true, color: true } },
      targetGroups: { include: { targetGroup: { select: { id: true, name: true, schoolLevel: true } } } },
      _count:       { select: { teams: true } },
    },
  },
} as const;

// PATCH /api/v2/organizer/events/[id]/competitions/[ecId]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; ecId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id: eventId, ecId } = await params;

  const { picName, picContact, maxTeams } = await req.json();

  const ec = await db.eventCompetition.findFirst({ where: { id: ecId, eventId } });
  if (!ec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const updated = await db.eventCompetition.update({
    where: { id: ecId },
    data: {
      ...(picName    !== undefined && { picName:    picName?.trim()    || null }),
      ...(picContact !== undefined && { picContact: picContact?.trim() || null }),
      ...(maxTeams   !== undefined && { maxTeams:   Number(maxTeams)   || 0    }),
    },
    include: EC_INCLUDE,
  });

  return NextResponse.json({ data: updated });
}

// DELETE /api/v2/organizer/events/[id]/competitions/[ecId]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; ecId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id: eventId, ecId } = await params;

  const ec = await db.eventCompetition.findFirst({ where: { id: ecId, eventId } });
  if (!ec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await db.eventCompetition.delete({ where: { id: ecId } });
  return NextResponse.json({ success: true });
}
