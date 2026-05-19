import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;

  const event = await db.event.findUnique({
    where: { id },
    include: {
      state: { select: { id: true, name: true } },
      zone:  { select: { id: true, name: true } },
      eventCompetitions: {
        orderBy: { createdAt: "asc" },
        include: {
          competition: {
            include: {
              theme: { select: { id: true, name: true, color: true } },
              targetGroups: { include: { targetGroup: { select: { id: true, name: true, schoolLevel: true } } } },
              _count: { select: { judgingCriteria: true } },
            },
          },
        },
      },
    },
  });

  if (!event) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ data: event });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;

  const {
    name, slug, description, scope, stateId, zoneId,
    venue, address, city, latitude, longitude,
    startDate, endDate, registrationStart, registrationEnd, status,
  } = await req.json();

  try {
    const event = await db.event.update({
      where: { id },
      data: {
        ...(name        && { name:        name.trim() }),
        ...(slug        && { slug:        slug.trim().toLowerCase().replace(/\s+/g, "-") }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(scope       && { scope }),
        ...(stateId  !== undefined && { stateId:  stateId  || null }),
        ...(zoneId   !== undefined && { zoneId:   zoneId   || null }),
        ...(venue    !== undefined && { venue:    venue?.trim()    || null }),
        ...(address  !== undefined && { address:  address?.trim()  || null }),
        ...(city     !== undefined && { city:     city?.trim()     || null }),
        ...(latitude  !== undefined && { latitude:  latitude  != null ? Number(latitude)  : null }),
        ...(longitude !== undefined && { longitude: longitude != null ? Number(longitude) : null }),
        ...(startDate         !== undefined && { startDate:         startDate         ? new Date(startDate)         : null }),
        ...(endDate           !== undefined && { endDate:           endDate           ? new Date(endDate)           : null }),
        ...(registrationStart !== undefined && { registrationStart: registrationStart ? new Date(registrationStart) : null }),
        ...(registrationEnd   !== undefined && { registrationEnd:   registrationEnd   ? new Date(registrationEnd)   : null }),
        ...(status      && { status }),
      },
    });
    return NextResponse.json({ data: event });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "SLUG_TAKEN" }, { status: 409 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;

  const event = await db.event.findUnique({ where: { id }, include: { _count: { select: { eventCompetitions: true } } } });
  if (!event) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (event._count.eventCompetitions > 0)
    return NextResponse.json({ error: "HAS_COMPETITIONS", message: "Remove all competitions first." }, { status: 409 });

  await db.event.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
