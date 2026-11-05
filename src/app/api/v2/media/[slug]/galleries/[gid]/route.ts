import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authMedia, ownGallery } from "@/lib/media-endpoint";

type Params = { params: Promise<{ slug: string; gid: string }> };

// PATCH { title?, description? }
export async function PATCH(req: NextRequest, { params }: Params) {
  const { slug, gid } = await params;
  const a = await authMedia(req, slug);
  if ("res" in a) return a.res;
  if (!(await ownGallery(a.ep.id, gid))) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const body = await req.json().catch(() => ({})) as { title?: string; description?: string };
  if (body.title !== undefined && !body.title.trim())
    return NextResponse.json({ error: "MISSING_TITLE", message: "Nama galeri diperlukan." }, { status: 400 });
  const g = await db.gallery.update({
    where: { id: gid },
    data: {
      ...(body.title !== undefined && { title: body.title.trim().slice(0, 150) }),
      ...(body.description !== undefined && { description: body.description.trim() || null }),
    },
    select: { id: true, title: true, description: true },
  });
  return NextResponse.json({ data: g });
}

// DELETE — only an empty gallery (photos are removed one by one first).
export async function DELETE(req: NextRequest, { params }: Params) {
  const { slug, gid } = await params;
  const a = await authMedia(req, slug);
  if ("res" in a) return a.res;
  if (!(await ownGallery(a.ep.id, gid))) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const photos = await db.galleryPhoto.count({ where: { galleryId: gid } });
  if (photos > 0) return NextResponse.json({ error: "NOT_EMPTY", message: "Buang semua foto dahulu." }, { status: 409 });
  await db.gallery.delete({ where: { id: gid } });
  return NextResponse.json({ ok: true });
}
