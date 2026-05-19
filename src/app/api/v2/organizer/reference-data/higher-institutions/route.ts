import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q        = searchParams.get("q") ?? "";
  const stateId  = searchParams.get("stateId") ?? undefined;
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? String(PAGE_SIZE), 10)));

  const where = {
    ...(stateId && { stateId }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { code: { contains: q, mode: "insensitive" as const } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    db.higherInstitution.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        state: { select: { id: true, name: true } },
        _count: { select: { contingents: true } },
      },
    }),
    db.higherInstitution.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { name, code, stateId } = await req.json();
  if (!name?.trim())
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  try {
    const hei = await db.higherInstitution.create({
      data: {
        name:    name.trim(),
        code:    code?.trim().toUpperCase() || undefined,
        stateId: stateId || undefined,
      },
    });
    return NextResponse.json({ data: hei }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "CODE_TAKEN" }, { status: 409 });
  }
}
