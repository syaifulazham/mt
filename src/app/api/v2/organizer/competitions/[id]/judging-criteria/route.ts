import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;

  const criteria = await db.judgingCriteria.findMany({
    where: { competitionId: id },
    orderBy: { order: "asc" },
  });
  return NextResponse.json({ data: criteria });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;

  const { name, description, value, order } = await req.json();
  if (!name?.trim() || value === undefined || value === null)
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const lastOrder = await db.judgingCriteria.aggregate({
    where: { competitionId: id },
    _max: { order: true },
  });

  const criterion = await db.judgingCriteria.create({
    data: {
      competitionId: id,
      name:          name.trim(),
      description:   description?.trim() || null,
      value:         Number(value),
      order:         order !== undefined ? Number(order) : (lastOrder._max.order ?? -1) + 1,
    },
  });
  return NextResponse.json({ data: criterion }, { status: 201 });
}

// Replace all criteria at once (used by the bulk-edit UI)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;

  const { criteria } = await req.json();
  if (!Array.isArray(criteria))
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

  const result = await db.$transaction(async (tx) => {
    await tx.judgingCriteria.deleteMany({ where: { competitionId: id } });
    if (criteria.length === 0) return [];
    return tx.judgingCriteria.createManyAndReturn({
      data: criteria.map((c: { name: string; description?: string; value: number }, i: number) => ({
        competitionId: id,
        name:          String(c.name).trim(),
        description:   c.description ? String(c.description).trim() : null,
        value:         Number(c.value),
        order:         i,
      })),
    });
  });

  return NextResponse.json({ data: result });
}
