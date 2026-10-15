import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { genAnnouncePasscode, genAnnounceSlug } from "@/lib/announcements";

const SELECT = {
  id: true, routeSlug: true, passcode: true, label: true, status: true, createdAt: true,
} as const;

// GET — the event's announcer boards (any organizer may view)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const endpoints = await db.announcementEndpoint.findMany({
    where: { eventId }, select: SELECT, orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ data: endpoints });
}

// POST { label? } — create an announcer board with a unique URL and passcode (Super Admin only)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const { label } = await req.json().catch(() => ({})) as { label?: string };
  let routeSlug = genAnnounceSlug();
  while (await db.announcementEndpoint.findUnique({ where: { routeSlug } })) routeSlug = genAnnounceSlug();

  const endpoint = await db.announcementEndpoint.create({
    data: { eventId, routeSlug, passcode: genAnnouncePasscode(), label: label?.trim() || null },
    select: SELECT,
  });
  return NextResponse.json({ data: endpoint }, { status: 201 });
}
