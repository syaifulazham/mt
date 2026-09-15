import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { csiConfigured, csiGetUser, csiListCases, toCsiUserId } from "@/lib/eptim-csi";

// GET /api/v2/participant/csi/team/status?teamId=… — team's Eptim CSI account state
export async function GET(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!csiConfigured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  const teamId = req.nextUrl.searchParams.get("teamId");
  if (!teamId) return NextResponse.json({ error: "MISSING_TEAM_ID" }, { status: 400 });

  // Verify the caller is a member of this team
  const membership = await db.teamMember.findUnique({
    where: { teamId_participantId: { teamId, participantId: session.participantId } },
    include: {
      team: { select: { id: true, name: true, csiAccess: true } },
    },
  });
  if (!membership) return NextResponse.json({ error: "NOT_MEMBER" }, { status: 403 });

  const { team } = membership;
  const csiUserId = team.csiAccess?.csiUserId ?? toCsiUserId(team.id);

  const [remote, cases] = await Promise.all([
    csiGetUser(csiUserId).catch(() => null),
    csiListCases().catch(() => null),
  ]);

  return NextResponse.json({
    registered: !!team.csiAccess,
    userExists: remote ? true : null,
    csiUserId:  team.csiAccess?.csiUserId ?? null,
    csiAlias:   team.csiAccess?.csiAlias ?? remote?.alias ?? null,
    caseCount:  cases?.length ?? null,
    teamId:     team.id,
    teamName:   team.name,
  });
}
