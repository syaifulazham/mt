import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

type CompRow = { id: string; code: string; name: string };

// GET /api/v2/organizer/events/[id]/preregistration/competitions
// Returns the distinct competitions used by teams actually registered in this event.
// This is more reliable than event_competitions which may be empty for events loaded
// from a prerequisite.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;

  const rows = await db.$queryRaw<CompRow[]>`
    SELECT DISTINCT c.id, c.code, c.name
    FROM teams t
    JOIN team_events te ON te."teamId" = t.id AND te."eventId" = ${eventId}
    JOIN competitions c ON c.id = t."competitionId"
    ORDER BY c.code
  `;

  return NextResponse.json({ data: rows });
}
