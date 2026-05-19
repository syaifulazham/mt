import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const template = await db.judgingTemplate.findUnique({
    where: { id },
    include: {
      criterions: {
        include: { options: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      },
    },
  });
  if (!template) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ template });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  try {
    const template = await db.judgingTemplate.update({
      where: { id },
      data: {
        ...(body.name        !== undefined && { name:        body.name?.trim() }),
        ...(body.code        !== undefined && { code:        body.code?.trim().toUpperCase() }),
        ...(body.description !== undefined && { description: body.description?.trim() || null }),
      },
    });
    return NextResponse.json({ template });
  } catch (e) {
    const msg = String(e);
    return NextResponse.json(
      { error: msg.includes("Unique") ? "CODE_TAKEN" : "UPDATE_FAILED" },
      { status: 400 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  try {
    await db.judgingTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "DELETE_FAILED", detail: String(e) }, { status: 500 });
  }
}
