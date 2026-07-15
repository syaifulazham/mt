import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

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

// GET — list general (event-level) endpoints
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;

  const endpoints = await db.walkInEndpoint.findMany({
    where: { eventId: id, walkInCompetitionId: null, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, routeSlug: true, passcode: true, label: true, active: true, createdAt: true },
  });

  return NextResponse.json({ data: endpoints });
}

// POST — create a new general (event-level) endpoint
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const existingCount = await db.walkInEndpoint.count({ where: { eventId: id, walkInCompetitionId: null } });
  const label = body.label?.trim() || `Kaunter ${existingCount + 1}`;

  let routeSlug = randomSlug();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.walkInEndpoint.findUnique({ where: { routeSlug } });
    if (!existing) break;
    routeSlug = randomSlug();
  }

  const endpoint = await db.walkInEndpoint.create({
    data: { eventId: id, walkInCompetitionId: null, routeSlug, passcode: randomPasscode(), label },
    select: { id: true, routeSlug: true, passcode: true, label: true, active: true, createdAt: true },
  });

  return NextResponse.json({ data: endpoint }, { status: 201 });
}
