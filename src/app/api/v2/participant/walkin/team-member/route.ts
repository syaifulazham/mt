import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { addWalkInTeamMember } from "@/lib/walkin-team-add";
import { cleanIc } from "@/lib/walkin-team";

// POST { walkInCompetitionId, ic, name } — add a member to the participant's
// team entry for a walk-in competition (pending or verified). Logic lives in
// src/lib/walkin-team-add.ts.
export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.walkInCompetitionId !== "string")
    return NextResponse.json({ error: "MISSING_WALK_IN_COMPETITION_ID" }, { status: 400 });

  const r = await addWalkInTeamMember({
    selfParticipantId: session.participantId,
    selfIc: cleanIc(session.ic ?? ""),
    walkInCompetitionId: body.walkInCompetitionId,
    ic: body.ic, name: body.name,
  });
  if ("error" in r) return NextResponse.json({ error: r.error, detail: r.detail }, { status: r.status });
  return NextResponse.json({ data: r });
}
