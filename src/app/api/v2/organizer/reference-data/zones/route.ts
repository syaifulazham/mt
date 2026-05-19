import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

const ZONE_INCLUDE = {
  states: { select: { state: { select: { id: true, name: true } } }, orderBy: { state: { name: "asc" } } },
  _count: { select: { districts: true, schools: true } },
} as const;

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const stateId  = searchParams.get("stateId") ?? undefined;
  const q        = searchParams.get("q") ?? "";
  const pageSize = Math.min(200, parseInt(searchParams.get("pageSize") ?? "50", 10));
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

  const where = {
    ...(stateId && { states: { some: { stateId } } }),
    ...(q && { name: { contains: q, mode: "insensitive" as const } }),
  };

  const [data, total] = await Promise.all([
    db.zone.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: ZONE_INCLUDE,
    }),
    db.zone.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { name, stateIds } = await req.json() as { name?: string; stateIds?: string[] };
  if (!name?.trim())
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const zone = await db.zone.create({
    data: {
      name:   name.trim(),
      ...(Array.isArray(stateIds) && stateIds.length > 0 && {
        states: { create: stateIds.map((sid) => ({ stateId: sid })) },
      }),
    },
    include: ZONE_INCLUDE,
  });

  return NextResponse.json({ data: zone }, { status: 201 });
}
