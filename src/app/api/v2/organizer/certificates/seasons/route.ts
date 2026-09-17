import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const seasons = await db.season.findMany({
    orderBy: [{ year: "desc" }, { code: "asc" }],
    include: { _count: { select: { certificates: true, templates: true } } },
  });

  return NextResponse.json({ data: seasons });
}

const WRITE_ROLES = ["SUPER_ADMIN"];

/** POST { code, serialPrefix, year, name, isCurrent? } — opening a new edition. */
export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { code, serialPrefix, year, name, isCurrent } = await req.json() as {
    code?: string; serialPrefix?: string; year?: number; name?: string; isCurrent?: boolean;
  };
  if (!code?.trim() || !year || !name?.trim())
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const season = await db.$transaction(async (tx) => {
    // A partial unique index enforces one current season; clear the old one first.
    if (isCurrent) await tx.season.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
    return tx.season.create({
      data: {
        code: code.trim().toUpperCase(),
        serialPrefix: (serialPrefix ?? code).trim().toUpperCase(),
        year, name: name.trim(), isCurrent: !!isCurrent,
      },
    });
  });

  return NextResponse.json({ data: season }, { status: 201 });
}
