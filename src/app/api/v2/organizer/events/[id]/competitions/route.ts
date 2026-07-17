import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

function makeEcInclude(eventId: string) {
  return {
    competition: {
      include: {
        theme:        { select: { id: true, name: true, color: true } },
        targetGroups: { include: { targetGroup: { select: { id: true, name: true, schoolLevel: true } } } },
        _count:       { select: { teams: { where: { teamEvents: { some: { eventId } } } } } },
      },
    },
  } as const;
}

// GET /api/v2/organizer/events/[id]/competitions
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id: eventId } = await params;

  const rows = await db.eventCompetition.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
    include: makeEcInclude(eventId),
  });

  return NextResponse.json({ data: rows, total: rows.length });
}

// POST /api/v2/organizer/events/[id]/competitions
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id: eventId } = await params;

  const { competitionId, picName, picContact, maxTeams } = await req.json();
  if (!competitionId) return NextResponse.json({ error: "MISSING_COMPETITION" }, { status: 400 });

  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });

  const competition = await db.competition.findUnique({ where: { id: competitionId } });
  if (!competition) return NextResponse.json({ error: "COMPETITION_NOT_FOUND" }, { status: 404 });

  try {
    const ec = await db.eventCompetition.create({
      data: {
        eventId,
        competitionId,
        picName:    picName?.trim()    || null,
        picContact: picContact?.trim() || null,
        maxTeams:   Number(maxTeams)   || 0,
      },
      include: makeEcInclude(eventId),
    });
    return NextResponse.json({ data: ec }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "ALREADY_LINKED" }, { status: 409 });
    throw e;
  }
}
