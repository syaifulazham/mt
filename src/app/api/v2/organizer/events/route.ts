import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q         = searchParams.get("q") ?? "";
  const status    = searchParams.get("status") ?? undefined;
  const notStatus = searchParams.get("notStatus") ?? undefined;
  const scope     = searchParams.get("scope") ?? undefined;
  const page      = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize  = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? String(PAGE_SIZE), 10)));

  const where: Prisma.EventWhereInput = {
    ...(status    && { status: status    as Prisma.EnumEventStatusFilter }),
    ...(!status && notStatus && { status: { not: notStatus as Prisma.EnumEventStatusFilter } }),
    ...(scope  && { scope:  scope  as Prisma.EnumEventScopeFilter  }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    db.event.findMany({
      where,
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        state: { select: { id: true, name: true } },
        zone:  { select: { id: true, name: true } },
        _count: { select: { eventCompetitions: true } },
      },
    }),
    db.event.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const {
    name, slug, description, scope, stateId, zoneId,
    venue, address, city, latitude, longitude,
    startDate, endDate, registrationStart, registrationEnd, status,
  } = await req.json();

  if (!name?.trim() || !slug?.trim())
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  try {
    const event = await db.event.create({
      data: {
        name:              name.trim(),
        slug:              slug.trim().toLowerCase().replace(/\s+/g, "-"),
        description:       description?.trim() || null,
        scope:             scope  || "NATIONAL",
        stateId:           stateId  || null,
        zoneId:            zoneId   || null,
        venue:             venue?.trim()   || null,
        address:           address?.trim() || null,
        city:              city?.trim()    || null,
        latitude:          latitude  != null ? Number(latitude)  : null,
        longitude:         longitude != null ? Number(longitude) : null,
        startDate:         startDate         ? new Date(startDate)         : null,
        endDate:           endDate           ? new Date(endDate)           : null,
        registrationStart: registrationStart ? new Date(registrationStart) : null,
        registrationEnd:   registrationEnd   ? new Date(registrationEnd)   : null,
        status:            status || "DRAFT",
      },
    });
    return NextResponse.json({ data: event }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "SLUG_TAKEN" }, { status: 409 });
    throw e;
  }
}
