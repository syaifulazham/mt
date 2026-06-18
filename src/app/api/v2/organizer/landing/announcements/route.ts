import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const announcements = await db.announcement.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(announcements);
}

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { title, content, coverUrl, isPublished } = await req.json();
  if (!title?.trim() || !content?.trim())
    return NextResponse.json({ error: "title and content are required" }, { status: 400 });

  const announcement = await db.announcement.create({
    data: {
      title:       title.trim(),
      content:     content.trim(),
      coverUrl:    coverUrl?.trim() || null,
      isPublished: Boolean(isPublished),
      publishedAt: isPublished ? new Date() : null,
    },
  });

  return NextResponse.json(announcement, { status: 201 });
}
