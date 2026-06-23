import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { eptimdrone } from "@/lib/eptim-drone";

export async function GET(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const teamId = req.nextUrl.searchParams.get("teamId");
  if (!teamId) return NextResponse.json({ error: "MISSING_TEAM_ID" }, { status: 400 });

  // Verify the caller is a member of this team
  const membership = await db.teamMember.findUnique({
    where: { teamId_participantId: { teamId, participantId: session.participantId } },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          contingent: { select: { id: true, name: true } },
          droneAccess: true,
        },
      },
    },
  });
  if (!membership) return NextResponse.json({ error: "NOT_MEMBER" }, { status: 403 });

  const { team } = membership;
  const contingentId = String(team.contingent.id);

  const [sectorCheck, userCheck] = await Promise.all([
    eptimdrone.checkSector(contingentId).catch(() => null),
    team.id ? eptimdrone.checkUser(team.id).catch(() => null) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    sectorExists:   sectorCheck ? !sectorCheck.available : null,
    userExists:     userCheck   ? !userCheck.available   : null,
    registered:     !!team.droneAccess,
    contingentId,
    contingentName: team.contingent.name,
    teamId:         team.id,
    teamName:       team.name,
    droneUserId:    team.droneAccess?.droneUserId ?? null,
  });
}
