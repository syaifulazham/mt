import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { Gender, EduLevel } from "@prisma/client";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX     = 100;

// ── GET /api/v2/manager/participants  ────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q          = searchParams.get("q") ?? "";
  const eduLevel   = searchParams.get("eduLevel") as EduLevel | null;
  const ppkiOnly   = searchParams.get("ppki") === "true";
  const noPassword = searchParams.get("noPassword") === "true";
  const page     = Math.max(1, parseInt(searchParams.get("page")     ?? "1",  10));
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1,
                    parseInt(searchParams.get("pageSize") ?? String(PAGE_SIZE_DEFAULT), 10)));

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: {
      contingentManagers: { select: { contingentId: true } },
    },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  if (contingentIds.length === 0)
    return NextResponse.json({ data: [], total: 0, page, pageSize, counts: { ALL: 0, KINDERGARTEN: 0, PRIMARY: 0, SECONDARY: 0, YOUTH: 0 } });

  // Base where (no eduLevel filter) — used for per-tab counts
  const baseWhere = {
    contingentId: { in: contingentIds },
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { ic:   { contains: q, mode: "insensitive" as const } },
      ],
    }),
    ...(ppkiOnly   && { ppki: true }),
    ...(noPassword && { passwordHash: null }),
  };

  const where = { ...baseWhere, ...(eduLevel && { eduLevel }) };

  const [rawData, total, eduCounts] = await Promise.all([
    db.participant.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, name: true, ic: true, email: true, phoneNumber: true,
        gender: true, age: true, eduLevel: true, classGrade: true, className: true,
        ethnicity: true,
        status: true, ppki: true, contingentId: true, createdAt: true, updatedAt: true,
        passwordHash: true,
      },
    }),
    db.participant.count({ where }),
    db.participant.groupBy({ by: ["eduLevel"], where: baseWhere, _count: { id: true } }),
  ]);

  const data = rawData.map(({ passwordHash, ...p }) => ({ ...p, hasPassword: passwordHash !== null }));

  const countMap = Object.fromEntries(eduCounts.map((e) => [e.eduLevel, e._count.id]));
  const counts = {
    ALL:          (countMap["KINDERGARTEN"] ?? 0) + (countMap["PRIMARY"] ?? 0) + (countMap["SECONDARY"] ?? 0) + (countMap["YOUTH"] ?? 0),
    KINDERGARTEN: countMap["KINDERGARTEN"] ?? 0,
    PRIMARY:      countMap["PRIMARY"]      ?? 0,
    SECONDARY:    countMap["SECONDARY"]    ?? 0,
    YOUTH:        countMap["YOUTH"]        ?? 0,
  };

  return NextResponse.json({ data, total, page, pageSize, counts });
}

// ── POST /api/v2/manager/participants  ───────────────────────────────────────
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: {
      contingentManagers: { where: { role: { in: ["OWNER", "MANAGER"] } }, select: { contingentId: true } },
    },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  if (contingentIds.length === 0)
    return NextResponse.json({ error: "NO_CONTINGENT" }, { status: 400 });

  const body = await req.json();
  const { name, ic, email, phoneNumber, gender, age, eduLevel, classGrade, className, ethnicity, contingentId } = body;

  if (!name || !gender || !eduLevel)
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  if (!contingentIds.includes(contingentId))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const participant = await db.participant.create({
    data: {
      name,
      ic:          ic          ?? null,
      email:       email       ?? null,
      phoneNumber: phoneNumber ?? null,
      gender:      gender      as Gender,
      age:         age ? Number(age) : null,
      eduLevel:    eduLevel    as EduLevel,
      classGrade:  classGrade  ?? null,
      className:   className   ?? null,
      ethnicity:   ethnicity   || null,
      contingentId,
    },
  });

  return NextResponse.json({ data: participant }, { status: 201 });
}
