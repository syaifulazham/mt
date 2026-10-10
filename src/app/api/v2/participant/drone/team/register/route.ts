import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { ensureDroneTeamAccount } from "@/lib/droneTeam";

export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { teamId } = await req.json().catch(() => ({})) as { teamId?: string };
  if (!teamId) return NextResponse.json({ error: "MISSING_TEAM_ID" }, { status: 400 });

  // Verify the caller is a member of this team
  const membership = await db.teamMember.findUnique({
    where: { teamId_participantId: { teamId, participantId: session.participantId } },
    select: { id: true },
  });
  if (!membership) return NextResponse.json({ error: "NOT_MEMBER" }, { status: 403 });

  // Sector (contingent) → team player (userid = team id) → membership; shared
  // with the dashboard's Drone challenge registration.
  await ensureDroneTeamAccount(teamId);

  return NextResponse.json({ ok: true });
}
