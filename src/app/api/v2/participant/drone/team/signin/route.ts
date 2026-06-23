import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { eptimdrone } from "@/lib/eptim-drone";

export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { teamId } = await req.json().catch(() => ({})) as { teamId?: string };
  if (!teamId) return NextResponse.json({ error: "MISSING_TEAM_ID" }, { status: 400 });

  // Verify the caller is a member of this team
  const membership = await db.teamMember.findUnique({
    where: { teamId_participantId: { teamId, participantId: session.participantId } },
  });
  if (!membership) return NextResponse.json({ error: "NOT_MEMBER" }, { status: 403 });

  const access = await db.teamDroneAccess.findUnique({ where: { teamId } });
  if (!access) return NextResponse.json({ error: "NOT_REGISTERED" }, { status: 404 });
  if (access.dronePassword === "__existing__")
    return NextResponse.json({ error: "PASSWORD_UNKNOWN" }, { status: 409 });

  const { access_token } = await eptimdrone.getToken(access.droneUserId, access.dronePassword);
  const appUrl = process.env.EPTIMDRONE_APP_URL ?? "";

  return NextResponse.json({ accessToken: access_token, appUrl });
}
