import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const school = await db.school.findUnique({
    where: { id },
    include: {
      state:    { select: { id: true, name: true } },
      zone:     { select: { id: true, name: true } },
      district: { select: { id: true, name: true } },
    },
  });
  if (!school) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ data: school });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  const { name, code, ppdCode, stateId, zoneId, districtId, level, category, isActive } = await req.json();
  try {
    const school = await db.school.update({
      where: { id },
      data: {
        ...(name       && { name:     name.trim() }),
        ...(code       && { code:     code.trim().toUpperCase() }),
        ...(ppdCode !== undefined && { ppdCode: ppdCode?.trim() || null }),
        ...(stateId    && { stateId }),
        ...(zoneId     !== undefined && { zoneId:     zoneId     || null }),
        ...(districtId !== undefined && { districtId: districtId || null }),
        ...(level      && { level }),
        ...(category   && { category }),
        ...(isActive   !== undefined && { isActive }),
      },
    });
    return NextResponse.json({ data: school });
  } catch {
    return NextResponse.json({ error: "CODE_TAKEN" }, { status: 409 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  const school = await db.school.findUnique({
    where: { id },
    include: { _count: { select: { contingents: true } } },
  });
  if (!school) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (school._count.contingents > 0)
    return NextResponse.json({ error: "HAS_DEPENDENTS" }, { status: 409 });
  await db.school.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
