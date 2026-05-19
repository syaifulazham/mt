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
  const { name, color, logoUrl, description } = await req.json();
  try {
    const theme = await db.theme.update({
      where: { id },
      data: {
        ...(name        && { name: name.trim() }),
        ...(color       !== undefined && { color:       color?.trim()       || null }),
        ...(logoUrl     !== undefined && { logoUrl:     logoUrl?.trim()     || null }),
        ...(description !== undefined && { description: description?.trim() || null }),
      },
    });
    return NextResponse.json({ data: theme });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "NAME_TAKEN" }, { status: 409 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  const theme = await db.theme.findUnique({ where: { id } });
  if (!theme) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  await db.theme.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
