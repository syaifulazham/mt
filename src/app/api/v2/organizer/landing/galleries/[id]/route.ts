import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.title       !== undefined) data.title       = String(body.title).trim();
  if (body.year        !== undefined) data.year        = Number(body.year);
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.coverUrl    !== undefined) data.coverUrl    = body.coverUrl || null;

  // Handle photo upserts if provided
  if (Array.isArray(body.photos)) {
    // Delete existing photos not in the new list
    const keepIds = body.photos.filter((p: { id?: string }) => p.id).map((p: { id: string }) => p.id);
    await db.galleryPhoto.deleteMany({ where: { galleryId: id, id: { notIn: keepIds } } });

    // Upsert each photo
    for (const [i, photo] of body.photos.entries()) {
      if (photo.id) {
        await db.galleryPhoto.update({
          where: { id: photo.id },
          data: { description: photo.description?.trim() || null, order: i },
        });
      } else {
        await db.galleryPhoto.create({
          data: {
            galleryId:   id,
            driveFileId: photo.driveFileId,
            thumbUrl:    photo.thumbUrl,
            fullUrl:     photo.fullUrl,
            description: photo.description?.trim() || null,
            order:       i,
          },
        });
      }
    }
  }

  const gallery = await db.gallery.update({
    where: { id },
    data,
    include: { photos: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json(gallery);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  await db.gallery.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
