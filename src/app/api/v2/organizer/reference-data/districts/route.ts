import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const zoneId = searchParams.get("zoneId") ?? undefined;
  const q      = searchParams.get("q") ?? "";

  const where = {
    ...(zoneId && { zoneId }),
    ...(q && { name: { contains: q, mode: "insensitive" as const } }),
  };

  const data = await db.district.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      zone: { select: { id: true, name: true, states: { select: { state: { select: { id: true, name: true } } } } } },
      _count: { select: { schools: true } },
    },
  });

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { name, zoneId } = await req.json();
  if (!name?.trim() || !zoneId)
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const district = await db.district.create({ data: { name: name.trim(), zoneId } });
  return NextResponse.json({ data: district }, { status: 201 });
}
