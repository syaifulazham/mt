import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authMedia, ownGallery } from "@/lib/media-endpoint";
import { r2Configured, r2Put } from "@/lib/r2";

export const maxDuration = 60;
const MAX_BYTES = 20 * 1024 * 1024;

type Params = { params: Promise<{ slug: string; gid: string }> };

// POST multipart { full: File, thumb?: File, description? } — one photo. The
// page shrinks photos before upload; the thumbnail is what galleries list.
export async function POST(req: NextRequest, { params }: Params) {
  const { slug, gid } = await params;
  const a = await authMedia(req, slug);
  if ("res" in a) return a.res;
  if (!(await ownGallery(a.ep.id, gid))) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!r2Configured()) return NextResponse.json({ error: "STORAGE_NOT_CONFIGURED", message: "Storan foto tidak dikonfigurasi." }, { status: 500 });

  const form = await req.formData().catch(() => null);
  const full = form?.get("full");
  const thumb = form?.get("thumb");
  if (!(full instanceof File) || !full.type.startsWith("image/"))
    return NextResponse.json({ error: "INVALID_FILE", message: "Fail mesti gambar." }, { status: 400 });
  if (full.size > MAX_BYTES || (thumb instanceof File && thumb.size > MAX_BYTES))
    return NextResponse.json({ error: "FILE_TOO_LARGE", message: "Gambar melebihi 20 MB." }, { status: 413 });

  const ext = full.type === "image/png" ? "png" : full.type === "image/webp" ? "webp" : "jpg";
  const base = `galleries/media/${gid}/${randomUUID()}`;
  const fullKey = `${base}.${ext}`;
  const fullUrl = await r2Put(fullKey, Buffer.from(await full.arrayBuffer()), full.type);
  const thumbUrl = thumb instanceof File && thumb.type.startsWith("image/")
    ? await r2Put(`${base}_t.${thumb.type === "image/png" ? "png" : "jpg"}`, Buffer.from(await thumb.arrayBuffer()), thumb.type)
    : fullUrl;

  const last = await db.galleryPhoto.findFirst({ where: { galleryId: gid }, orderBy: { order: "desc" }, select: { order: true } });
  const description = typeof form?.get("description") === "string" ? String(form.get("description")).trim().slice(0, 300) || null : null;
  const photo = await db.galleryPhoto.create({
    data: { galleryId: gid, driveFileId: fullKey, fullUrl, thumbUrl, description, order: (last?.order ?? -1) + 1 },
    select: { id: true, thumbUrl: true, fullUrl: true, description: true, order: true, createdAt: true },
  });
  return NextResponse.json({ data: photo }, { status: 201 });
}
