import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authMedia } from "@/lib/media-endpoint";

// GET — what the passcode screen shows (no passcode needed).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ep = await db.mediaEndpoint.findUnique({
    where: { routeSlug: slug }, select: { active: true, label: true, event: { select: { name: true } } },
  });
  if (!ep || !ep.active) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ label: ep.label, eventName: ep.event.name });
}

// POST — check a passcode (header x-media-passcode).
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await authMedia(req, slug);
  if ("res" in a) return a.res;
  return NextResponse.json({ ok: true, label: a.ep.label, eventName: a.ep.event.name });
}
