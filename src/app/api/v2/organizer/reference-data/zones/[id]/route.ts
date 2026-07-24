import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

const ZONE_INCLUDE = {
  states: { select: { state: { select: { id: true, name: true } } }, orderBy: { state: { name: "asc" } } },
  _count: { select: { districts: true, schools: true } },
} as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;

  const zone = await db.zone.findUnique({ where: { id }, include: ZONE_INCLUDE });
  if (!zone) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ data: zone });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;

  const { name, stateIds } = await req.json() as { name?: string; stateIds?: string[] };

  const zone = await db.zone.update({
    where: { id },
    data: {
      ...(name && { name: name.trim() }),
      ...(Array.isArray(stateIds) && {
        states: {
          deleteMany: {},
          create: stateIds.map((sid) => ({ stateId: sid })),
        },
      }),
    },
    include: ZONE_INCLUDE,
  });

  return NextResponse.json({ data: zone });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;

  const zone = await db.zone.findUnique({
    where: { id },
    include: { _count: { select: { schools: true, districts: true } } },
  });
  if (!zone) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (zone._count.schools > 0 || zone._count.districts > 0)
    return NextResponse.json({ error: "HAS_DEPENDENTS" }, { status: 409 });

  await db.zone.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
