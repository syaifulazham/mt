import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { targetGroupMatchSql } from "@/lib/targetGroupMatch";

type TargetGroupRow = { id: string; code: string; name: string };

// GET /api/v2/organizer/events/[id]/preregistration/target-groups
// Returns the distinct Target Groups (Reference Data) that have at least one
// matching participant among teams actually registered in this event.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;

  const rows = await db.$queryRaw<TargetGroupRow[]>`
    SELECT DISTINCT tg.id, tg.code, tg.name
    FROM team_members tm
    JOIN contestants p ON p.id = tm."contestantId"
    JOIN teams       t ON t.id = tm."teamId"
    JOIN team_events te ON te."teamId" = t.id AND te."eventId" = ${eventId}
    JOIN target_groups tg ON ${targetGroupMatchSql("p", "tg")}
    ORDER BY tg.name
  `;

  return NextResponse.json({ data: rows });
}
