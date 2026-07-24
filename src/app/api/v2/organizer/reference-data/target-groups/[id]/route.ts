import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  const { code, name, schoolLevel, ageGroup, minAge, maxAge, classGrades, ppki } = await req.json();
  try {
    const tg = await db.targetGroup.update({
      where: { id },
      data: {
        ...(code        && { code:        code.trim().toUpperCase() }),
        ...(name        && { name:        name.trim() }),
        ...(schoolLevel && { schoolLevel: schoolLevel.trim() }),
        ...(ageGroup !== undefined && { ageGroup: String(ageGroup).trim() }),
        ...(minAge !== undefined && { minAge: Number(minAge) }),
        ...(maxAge !== undefined && { maxAge: Number(maxAge) }),
        ...(Array.isArray(classGrades) && { classGrades }),
        ...(ppki !== undefined && { ppki: Boolean(ppki) }),
      },
    });
    return NextResponse.json({ data: tg });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "CODE_TAKEN" }, { status: 409 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  const tg = await db.targetGroup.findUnique({ where: { id } });
  if (!tg) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  await db.targetGroup.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
