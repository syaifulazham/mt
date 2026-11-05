import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authMedia } from "@/lib/media-endpoint";

type Params = { params: Promise<{ slug: string }> };
const PHOTO_SELECT = { id: true, thumbUrl: true, fullUrl: true, description: true, order: true, createdAt: true } as const;

// GET — this endpoint's galleries, newest first, with their photos.
export async function GET(req: NextRequest, { params }: Params) {
  const { slug } = await params;
  const a = await authMedia(req, slug);
  if ("res" in a) return a.res;
  const galleries = await db.gallery.findMany({
    where: { mediaEndpointId: a.ep.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, year: true, description: true, createdAt: true, photos: { orderBy: { order: "asc" }, select: PHOTO_SELECT } },
  });
  return NextResponse.json({ data: galleries });
}

// POST { title, year?, description? } — a new gallery.
export async function POST(req: NextRequest, { params }: Params) {
  const { slug } = await params;
  const a = await authMedia(req, slug);
  if ("res" in a) return a.res;
  const body = await req.json().catch(() => ({})) as { title?: string; year?: number; description?: string };
  const title = body.title?.trim().slice(0, 150);
  if (!title) return NextResponse.json({ error: "MISSING_TITLE", message: "Nama galeri diperlukan." }, { status: 400 });
  const year = Number.isInteger(body.year) && body.year! >= 2000 && body.year! <= 2100 ? body.year! : new Date().getFullYear();
  const gallery = await db.gallery.create({
    data: { title, year, description: body.description?.trim() || null, mediaEndpointId: a.ep.id },
    select: { id: true, title: true, year: true, description: true, createdAt: true, photos: { select: PHOTO_SELECT } },
  });
  return NextResponse.json({ data: gallery }, { status: 201 });
}
