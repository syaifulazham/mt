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

// POST — generate (or regenerate) counter endpoint
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { wicId } = await params;

  // Generate unique slug
  let routeSlug = randomSlug();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.eventWalkInCompetition.findUnique({ where: { routeSlug } });
    if (!existing) break;
    routeSlug = randomSlug();
  }

  const passcode = randomPasscode();

  const wic = await db.eventWalkInCompetition.update({
    where: { id: wicId },
    data: { routeSlug, passcode, endpointActive: true },
    select: { id: true, routeSlug: true, passcode: true, endpointActive: true },
  });

  return NextResponse.json({ data: wic });
}

// DELETE — deactivate endpoint
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { wicId } = await params;

  await db.eventWalkInCompetition.update({
    where: { id: wicId },
    data: { endpointActive: false, routeSlug: null, passcode: null },
  });
  return NextResponse.json({ success: true });
}
