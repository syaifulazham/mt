import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authMedia, ownGallery } from "@/lib/media-endpoint";
import { r2Delete, r2KeyOf } from "@/lib/r2";

type Params = { params: Promise<{ slug: string; gid: string; pid: string }> };

async function load(req: NextRequest, p: Params["params"]) {
  const { slug, gid, pid } = await p;
  const a = await authMedia(req, slug);
  if ("res" in a) return { res: a.res };
  if (!(await ownGallery(a.ep.id, gid))) return { res: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }) };
  const photo = await db.galleryPhoto.findFirst({ where: { id: pid, galleryId: gid }, select: { id: true, driveFileId: true, fullUrl: true, thumbUrl: true } });
  if (!photo) return { res: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }) };
  return { photo };
}

// PATCH { description }
export async function PATCH(req: NextRequest, { params }: Params) {
  const l = await load(req, params);
  if ("res" in l) return l.res;
  const body = await req.json().catch(() => ({})) as { description?: string };
  const p = await db.galleryPhoto.update({
    where: { id: l.photo.id }, data: { description: body.description?.trim().slice(0, 300) || null },
    select: { id: true, description: true },
  });
  return NextResponse.json({ data: p });
}

// DELETE — the photo and its stored files.
export async function DELETE(req: NextRequest, { params }: Params) {
  const l = await load(req, params);
  if ("res" in l) return l.res;
  await db.galleryPhoto.delete({ where: { id: l.photo.id } });
  const keys = [l.photo.driveFileId];
  const thumbKey = l.photo.thumbUrl !== l.photo.fullUrl ? r2KeyOf(l.photo.thumbUrl) : null;
  if (thumbKey) keys.push(thumbKey);
  await Promise.all(keys.map(r2Delete));
  return NextResponse.json({ ok: true });
}
