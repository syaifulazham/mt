import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const item = await db.knowledgeBase.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  try {
    const item = await db.knowledgeBase.update({
      where: { id },
      data: {
        ...(body.title   !== undefined && { title:   body.title?.trim()   || undefined }),
        ...(body.path    !== undefined && { path:    body.path?.trim()    || undefined }),
        ...(body.content !== undefined && { content: body.content }),
      },
    });
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json({ error: "UPDATE_FAILED", detail: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  try {
    await db.knowledgeBase.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "DELETE_FAILED", detail: String(e) }, { status: 500 });
  }
}
