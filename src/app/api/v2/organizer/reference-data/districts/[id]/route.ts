import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  const { name, zoneId } = await req.json();
  const district = await db.district.update({
    where: { id },
    data: { ...(name && { name: name.trim() }), ...(zoneId && { zoneId }) },
  });
  return NextResponse.json({ data: district });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  const district = await db.district.findUnique({ where: { id }, include: { _count: { select: { schools: true } } } });
  if (!district) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (district._count.schools > 0)
    return NextResponse.json({ error: "HAS_DEPENDENTS" }, { status: 409 });
  await db.district.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
