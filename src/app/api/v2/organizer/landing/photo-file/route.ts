import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

// GET ?url=<public R2 photo URL>[&download=1] — the photo from our own origin,
// so the share menu can attach the file (Web Share) or download it; the R2
// public domain sends no CORS headers. Only URLs of stored gallery photos are
// served (they may be on the R2 custom domain or the r2.dev one).
const SHARE_ROLES = ["SUPER_ADMIN"];

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!SHARE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const url = req.nextUrl.searchParams.get("url") ?? "";
  const known = url && (await db.galleryPhoto.findFirst({ where: { OR: [{ fullUrl: url }, { thumbUrl: url }] }, select: { id: true } }));
  if (!known || !/^https:\/\//.test(url)) return NextResponse.json({ error: "INVALID_URL" }, { status: 400 });

  const upstream = await fetch(url).catch(() => null);
  if (!upstream?.ok || !upstream.body) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const type = upstream.headers.get("content-type") ?? "image/jpeg";
  const name = new URL(url).pathname.split("/").pop() || "foto.jpg";
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=300",
      ...(req.nextUrl.searchParams.get("download") && { "Content-Disposition": `attachment; filename="techlympics-${name}"` }),
    },
  });
}
