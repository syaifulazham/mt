import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const state = await db.state.findUnique({ where: { id } });
  if (!state) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ data: state });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  const { name, code, flagUrl } = await req.json();
  try {
    const state = await db.state.update({
      where: { id },
      data: {
        ...(name    && { name:    name.trim() }),
        ...(code    && { code:    code.trim().toUpperCase() }),
        ...(flagUrl !== undefined && { flagUrl: flagUrl || null }),
      },
    });
    return NextResponse.json({ data: state });
  } catch {
    return NextResponse.json({ error: "CODE_TAKEN" }, { status: 409 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  const state = await db.state.findUnique({ where: { id }, include: { _count: { select: { schools: true, contingents: true } } } });
  if (!state) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (state._count.schools > 0 || state._count.contingents > 0)
    return NextResponse.json({ error: "HAS_DEPENDENTS" }, { status: 409 });
  await db.state.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
