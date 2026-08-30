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
      prerequisites: {
        include: {
          prerequisite: { select: { id: true, name: true, slug: true, status: true } },
        },
      },
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
    prerequisiteEventIds, needManagerAcceptance, walkInUniqueParticipation,
    participationPolicy, winnerExclusionRank,
  } = await req.json();

  const VALID_POLICIES = ["ALL", "PREREQUISITE_SELECTED", "ALL_EXCEPT_ZONE_WINNERS"];
  if (participationPolicy !== undefined && !VALID_POLICIES.includes(participationPolicy))
    return NextResponse.json({ error: "INVALID_POLICY" }, { status: 400 });

  try {
    // When prerequisites are assigned and no explicit policy given, default to PREREQUISITE_SELECTED
    let autoPolicy: string | undefined;
    if (Array.isArray(prerequisiteEventIds) && prerequisiteEventIds.length > 0 && participationPolicy === undefined) {
      const current = await db.event.findUnique({ where: { id }, select: { participationPolicy: true } });
      if (current?.participationPolicy === "ALL") autoPolicy = "PREREQUISITE_SELECTED";
    }

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
        ...(Array.isArray(prerequisiteEventIds) && {
          prerequisites: {
            deleteMany: {},
            create: prerequisiteEventIds.map((pid: string) => ({ prerequisiteId: pid })),
          },
        }),
        ...(needManagerAcceptance !== undefined && { needManagerAcceptance: Boolean(needManagerAcceptance) }),
        ...(walkInUniqueParticipation !== undefined && { walkInUniqueParticipation: Boolean(walkInUniqueParticipation) }),
        ...(participationPolicy !== undefined && { participationPolicy }),
        ...(autoPolicy !== undefined && { participationPolicy: autoPolicy as "PREREQUISITE_SELECTED" }),
        ...(winnerExclusionRank !== undefined && { winnerExclusionRank: winnerExclusionRank != null ? Number(winnerExclusionRank) : null }),
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
