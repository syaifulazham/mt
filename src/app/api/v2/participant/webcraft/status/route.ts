import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { webcraftConfigured, webcraftUserExists, toWebcraftUserId } from "@/lib/eptim-webcraft";
import { loadTeamWebcraft } from "@/lib/webcraft-team";

// GET /api/v2/participant/webcraft/status[?teamId=] — with teamId, the team's shared account
export async function GET(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!webcraftConfigured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  const teamId = req.nextUrl.searchParams.get("teamId");
  if (teamId) {
    const ctx = await loadTeamWebcraft(teamId, session.participantId);
    if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: 403 });
    // Before first sign-in the team has no row yet; a member's account will be adopted then.
    const source = ctx.access
      ? ctx.memberAccounts.find((a) => a.participantId === ctx.access!.sourceParticipantId) ?? null
      : ctx.memberAccounts[0] ?? null;
    return NextResponse.json({
      team:           true,
      registered:     !!ctx.access || ctx.memberAccounts.length > 0,
      userExists:     null,
      webcraftUserId: ctx.access?.webcraftUserId ?? null,
      sharedFrom:     source?.name ?? null,
    });
  }

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: { id: true, name: true, webcraftAccess: true },
  });
  if (!participant) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const webcraftUserId = participant.webcraftAccess?.webcraftUserId ?? toWebcraftUserId(participant.id);
  const existsRemote = await webcraftUserExists(webcraftUserId).catch(() => null);

  return NextResponse.json({
    registered: !!participant.webcraftAccess,
    userExists: existsRemote,
    webcraftUserId: participant.webcraftAccess?.webcraftUserId ?? null,
  });
}
