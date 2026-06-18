import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { title, content, coverUrl, isPublished } = body;

  const existing = await db.announcement.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const wasPublished = existing.isPublished;
  const nowPublished = Boolean(isPublished);

  const announcement = await db.announcement.update({
    where: { id },
    data: {
      title:       title?.trim()    ?? existing.title,
      content:     content?.trim()  ?? existing.content,
      coverUrl:    coverUrl !== undefined ? (coverUrl?.trim() || null) : existing.coverUrl,
      isPublished: nowPublished,
      publishedAt: nowPublished && !wasPublished ? new Date() : (nowPublished ? existing.publishedAt : null),
    },
  });

  return NextResponse.json(announcement);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  await db.announcement.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
