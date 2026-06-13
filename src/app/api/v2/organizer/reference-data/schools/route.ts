import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { SchoolLevel, SchoolCategory, Prisma } from "@prisma/client";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q          = searchParams.get("q") ?? "";
  const stateId    = searchParams.get("stateId") ?? undefined;
  const zoneId     = searchParams.get("zoneId") ?? undefined;
  const districtId = searchParams.get("districtId") ?? undefined;
  const level      = searchParams.get("level") as SchoolLevel | null;
  const category   = searchParams.get("category") as SchoolCategory | null;
  const page       = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize   = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? String(PAGE_SIZE), 10)));

  const where = {
    ...(stateId    && { stateId }),
    ...(zoneId     && { zoneId }),
    ...(districtId && { districtId }),
    ...(level      && { level }),
    ...(category   && { category }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { code: { contains: q, mode: "insensitive" as const } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    db.school.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        state:    { select: { id: true, name: true } },
        zone:     { select: { id: true, name: true } },
        district: { select: { id: true, name: true } },
      },
    }),
    db.school.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { name, code, ppdCode, stateId, zoneId, districtId, level, category } = await req.json();
  if (!name?.trim() || !code?.trim() || !stateId || !level || !category)
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const normalizedCode = code.trim().toUpperCase();

  // Explicit pre-check so we can surface exact conflict details
  const existing = await db.school.findFirst({
    where: { code: normalizedCode },
    select: { id: true, name: true, isActive: true },
  });
  if (existing) {
    return NextResponse.json({ error: "CODE_TAKEN", existing }, { status: 409 });
  }

  try {
    const school = await db.school.create({
      data: {
        name:     name.trim(),
        code:     normalizedCode,
        ppdCode:  ppdCode?.trim() || undefined,
        stateId,
        zoneId:     zoneId     || undefined,
        districtId: districtId || undefined,
        level,
        category,
      },
    });
    return NextResponse.json({ data: school }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "CODE_TAKEN" }, { status: 409 });
    }
    console.error("[school POST]", e);
    const msg = e instanceof Error ? e.message : "CREATE_FAILED";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
