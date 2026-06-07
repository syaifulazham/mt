import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const articles = await db.newsArticle.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(articles);
}

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { title, source, sourceUrl, content, images, isPublished } = await req.json();
  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "title and content are required" }, { status: 400 });
  }

  const article = await db.newsArticle.create({
    data: {
      title: title.trim(),
      source: source?.trim() || null,
      sourceUrl: sourceUrl?.trim() || null,
      content: content.trim(),
      images: Array.isArray(images) ? images : [],
      isPublished: Boolean(isPublished),
      publishedAt: isPublished ? new Date() : null,
    },
  });

  return NextResponse.json(article, { status: 201 });
}
