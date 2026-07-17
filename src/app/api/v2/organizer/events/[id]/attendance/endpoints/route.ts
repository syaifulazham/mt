import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

function randomCode(len = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++)
    s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function randomPasscode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// GET — list all endpoints for this event
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id: eventId } = await params;

  const endpoints = await db.attendanceEndpoint.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, routeCode: true, passcode: true, label: true,
      active: true, retiredAt: true, createdAt: true,
    },
  });

  return NextResponse.json({ data: endpoints });
}

// POST — create a new endpoint
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({}));

  const existingCount = await db.attendanceEndpoint.count({ where: { eventId } });
  const label: string = body.label?.trim() || `Kaunter ${existingCount + 1}`;

  let routeCode = randomCode();
  for (let attempt = 0; attempt < 10; attempt++) {
    const exists = await db.attendanceEndpoint.findUnique({ where: { routeCode } });
    if (!exists) break;
    routeCode = randomCode();
  }

  const endpoint = await db.attendanceEndpoint.create({
    data: { eventId, routeCode, passcode: randomPasscode(), label },
    select: {
      id: true, routeCode: true, passcode: true, label: true,
      active: true, retiredAt: true, createdAt: true,
    },
  });

  return NextResponse.json({ data: endpoint }, { status: 201 });
}
