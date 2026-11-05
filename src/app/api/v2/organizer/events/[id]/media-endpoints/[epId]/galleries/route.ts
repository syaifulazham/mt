import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { MEDIA_ADMIN_ROLES } from "@/lib/media-endpoint";

// GET — the galleries made through this media endpoint, newest first, with a
// few thumbnails each (SUPER_ADMIN).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; epId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!MEDIA_ADMIN_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id, epId } = await params;
  const ep = await db.mediaEndpoint.findFirst({ where: { id: epId, eventId: id }, select: { id: true } });
  if (!ep) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const rows = await db.gallery.findMany({
    where: { mediaEndpointId: epId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, title: true, year: true, createdAt: true, updatedAt: true, coverUrl: true,
      _count: { select: { photos: true } },
      photos: { orderBy: { order: "desc" }, take: 6, select: { id: true, thumbUrl: true, fullUrl: true } },
    },
  });
  return NextResponse.json({
    data: rows.map(g => ({
      id: g.id, title: g.title, year: g.year,
      createdAt: g.createdAt.toISOString(), updatedAt: g.updatedAt.toISOString(),
      photoCount: g._count.photos, thumbs: g.photos.map(p => p.thumbUrl),
      // The picture attached when sharing: the cover, else the newest photo.
      shareImage: g.coverUrl ?? g.photos[0]?.fullUrl ?? null,
    })),
  });
}
