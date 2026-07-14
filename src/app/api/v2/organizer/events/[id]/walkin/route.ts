import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

const WIC_INCLUDE = {
  competition: {
    select: {
      id: true, code: true, name: true,
      participationType: true, minTeamSize: true, maxTeamSize: true,
      targetGroups: { include: { targetGroup: { select: { id: true, name: true } } } },
    },
  },
  _count: { select: { registrations: true } },
} as const;

// GET /api/v2/organizer/events/[id]/walkin
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id: eventId } = await params;

  const rows = await db.eventWalkInCompetition.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
    include: WIC_INCLUDE,
  });

  return NextResponse.json({ data: rows, total: rows.length });
}

// POST /api/v2/organizer/events/[id]/walkin
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id: eventId } = await params;

  const { competitionId, picName, picContact, maxSlots } = await req.json();
  if (!competitionId) return NextResponse.json({ error: "MISSING_COMPETITION" }, { status: 400 });

  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });

  const competition = await db.competition.findUnique({ where: { id: competitionId } });
  if (!competition) return NextResponse.json({ error: "COMPETITION_NOT_FOUND" }, { status: 404 });

  try {
    const wic = await db.eventWalkInCompetition.create({
      data: {
        eventId,
        competitionId,
        picName:    picName?.trim()    || null,
        picContact: picContact?.trim() || null,
        maxSlots:   Number(maxSlots)   || 0,
      },
      include: WIC_INCLUDE,
    });
    return NextResponse.json({ data: wic }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "ALREADY_LINKED" }, { status: 409 });
    throw e;
  }
}
