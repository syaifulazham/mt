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
  const q           = searchParams.get("q") ?? "";
  const schoolLevel = searchParams.get("schoolLevel") ?? undefined;
  const page        = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize    = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? String(PAGE_SIZE), 10)));

  const where = {
    ...(schoolLevel && { schoolLevel }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { code: { contains: q, mode: "insensitive" as const } },
        { ageGroup: { contains: q, mode: "insensitive" as const } },
      ],
    }),
  };

  try {
    const [data, total] = await Promise.all([
      db.targetGroup.findMany({
        where,
        orderBy: [{ schoolLevel: "asc" }, { minAge: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.targetGroup.count({ where }),
    ]);
    return NextResponse.json({ data, total, page, pageSize });
  } catch (e: unknown) {
    if (e instanceof TypeError && String(e.message).includes("undefined")) {
      return NextResponse.json(
        { error: "RESTART_REQUIRED", message: "Prisma client is stale. Stop the dev server and run `npm run dev` again." },
        { status: 503 }
      );
    }
    throw e;
  }
}

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { code, name, schoolLevel, ageGroup, minAge, maxAge, classGrades, ppki } = await req.json();
  if (!code?.trim() || !name?.trim() || !schoolLevel || !ageGroup?.trim())
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  try {
    const tg = await db.targetGroup.create({
      data: {
        code:        code.trim().toUpperCase(),
        name:        name.trim(),
        schoolLevel: schoolLevel.trim(),
        ageGroup:    ageGroup.trim(),
        minAge:      Number(minAge) || 0,
        maxAge:      Number(maxAge) || 0,
        classGrades: Array.isArray(classGrades) ? classGrades : [],
        ppki:        Boolean(ppki),
      },
    });
    return NextResponse.json({ data: tg }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "CODE_TAKEN" }, { status: 409 });
    throw e;
  }
}
