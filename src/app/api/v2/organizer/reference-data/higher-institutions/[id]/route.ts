import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const hei = await db.higherInstitution.findUnique({
    where: { id },
    include: { state: { select: { id: true, name: true } } },
  });
  if (!hei) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ data: hei });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  const { name, code, stateId, isActive } = await req.json();
  try {
    const hei = await db.higherInstitution.update({
      where: { id },
      data: {
        ...(name     && { name: name.trim() }),
        ...(code !== undefined && { code: code?.trim().toUpperCase() || null }),
        ...(stateId  !== undefined && { stateId: stateId || null }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    return NextResponse.json({ data: hei });
  } catch {
    return NextResponse.json({ error: "CODE_TAKEN" }, { status: 409 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  const hei = await db.higherInstitution.findUnique({
    where: { id },
    include: { _count: { select: { contingents: true } } },
  });
  if (!hei) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (hei._count.contingents > 0)
    return NextResponse.json({ error: "HAS_DEPENDENTS" }, { status: 409 });
  await db.higherInstitution.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
