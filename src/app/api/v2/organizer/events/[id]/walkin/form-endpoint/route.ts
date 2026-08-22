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

// GET — list public form endpoints for the event
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;

  const endpoints = await db.walkInFormEndpoint.findMany({
    where: { eventId: id, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, routeSlug: true, label: true, active: true, createdAt: true },
  });

  return NextResponse.json({ data: endpoints });
}

// POST — create a new public form endpoint
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const existingCount = await db.walkInFormEndpoint.count({ where: { eventId: id } });
  const label = body.label?.trim() || `Borang ${existingCount + 1}`;

  let routeSlug = randomSlug();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.walkInFormEndpoint.findUnique({ where: { routeSlug } });
    if (!existing) break;
    routeSlug = randomSlug();
  }

  const endpoint = await db.walkInFormEndpoint.create({
    data: { eventId: id, routeSlug, label },
    select: { id: true, routeSlug: true, label: true, active: true, createdAt: true },
  });

  return NextResponse.json({ data: endpoint }, { status: 201 });
}
