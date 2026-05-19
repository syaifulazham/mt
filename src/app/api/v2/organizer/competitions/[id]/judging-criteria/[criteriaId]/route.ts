import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; criteriaId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { criteriaId } = await params;

  const { name, description, value, order } = await req.json();
  const criterion = await db.judgingCriteria.update({
    where: { id: criteriaId },
    data: {
      ...(name        && { name:        name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(value       !== undefined && { value:       Number(value) }),
      ...(order       !== undefined && { order:       Number(order) }),
    },
  });
  return NextResponse.json({ data: criterion });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; criteriaId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { criteriaId } = await params;

  await db.judgingCriteria.delete({ where: { id: criteriaId } });
  return NextResponse.json({ success: true });
}
