import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

function generatePasscode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// GET /api/v2/organizer/events/[id]/results-endpoints
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const isWalkIn = req.nextUrl.searchParams.get("isWalkIn") === "true";

  const rows = await db.resultsEndpoint.findMany({
    where: { eventId, isWalkIn },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: rows, total: rows.length });
}

// POST /api/v2/organizer/events/[id]/results-endpoints
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId } = await params;

  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });

  const body = await req.json() as {
    label?: string;
    requirePasscode?: boolean;
    competitionIds?: string[];
    isWalkIn?: boolean;
  };

  const routeSlug = randomBytes(10).toString("hex");
  const passcode = body.requirePasscode ? generatePasscode() : null;

  const endpoint = await db.resultsEndpoint.create({
    data: {
      eventId,
      routeSlug,
      passcode,
      label: body.label?.trim() || null,
      isWalkIn: body.isWalkIn ?? false,
      competitionIds: body.competitionIds ?? [],
    },
  });

  return NextResponse.json({ data: endpoint }, { status: 201 });
}
