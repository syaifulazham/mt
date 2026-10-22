import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];

function randomSlug(len = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++)
    s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function randomPasscode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST — add a new counter endpoint to this walk-in competition
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { wicId } = await params;

  const body = await req.json().catch(() => ({}));
  const label: string | undefined = body.label?.trim() || undefined;

  // Auto-label if not provided: "Kaunter N"
  const existingCount = await db.walkInEndpoint.count({ where: { walkInCompetitionId: wicId } });
  const resolvedLabel = label ?? `Kaunter ${existingCount + 1}`;

  // Generate unique slug
  let routeSlug = randomSlug();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.walkInEndpoint.findUnique({ where: { routeSlug } });
    if (!existing) break;
    routeSlug = randomSlug();
  }

  const passcode = randomPasscode();

  // Resolve eventId from the WIC
  const wic = await db.eventWalkInCompetition.findUnique({ where: { id: wicId }, select: { eventId: true } });
  if (!wic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const endpoint = await db.walkInEndpoint.create({
    data: { eventId: wic.eventId, walkInCompetitionId: wicId, routeSlug, passcode, label: resolvedLabel },
    select: { id: true, routeSlug: true, passcode: true, label: true, active: true, createdAt: true },
  });

  return NextResponse.json({ data: endpoint }, { status: 201 });
}
