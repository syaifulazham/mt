import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { title, source, sourceUrl, content, images, isPublished } = body;

  const existing = await db.newsArticle.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const wasPublished = existing.isPublished;
  const nowPublished = Boolean(isPublished);

  const article = await db.newsArticle.update({
    where: { id },
    data: {
      title:       title?.trim()     ?? existing.title,
      source:      source !== undefined  ? (source?.trim() || null)     : existing.source,
      sourceUrl:   sourceUrl !== undefined ? (sourceUrl?.trim() || null) : existing.sourceUrl,
      content:     content?.trim()   ?? existing.content,
      images:      Array.isArray(images) ? images : existing.images,
      isPublished: nowPublished,
      publishedAt: nowPublished && !wasPublished ? new Date() : (nowPublished ? existing.publishedAt : null),
    },
  });

  return NextResponse.json(article);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  await db.newsArticle.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
