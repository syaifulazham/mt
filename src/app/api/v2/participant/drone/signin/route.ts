import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { eptimdrone } from "@/lib/eptim-drone";

export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // competitionId accepted for API consistency but not used
  await req.json().catch(() => ({}));

  const access = await db.droneAccess.findUnique({ where: { participantId: session.participantId } });
  if (!access) return NextResponse.json({ error: "NOT_REGISTERED" }, { status: 404 });
  if (access.dronePassword === "__existing__")
    return NextResponse.json({ error: "PASSWORD_UNKNOWN" }, { status: 409 });

  const { access_token } = await eptimdrone.getToken(access.droneUserId, access.dronePassword);
  const appUrl = process.env.EPTIMDRONE_APP_URL ?? "";

  return NextResponse.json({ accessToken: access_token, appUrl });
}
