import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { ensureDroneParticipantAccount } from "@/lib/droneTeam";

export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // competitionId accepted but not stored — kept for API consistency
  await req.json().catch(() => ({}));

  // Sector (contingent) → player (userid = IC digits) → membership; shared with
  // the dashboard's individual Drone challenge registration.
  try {
    await ensureDroneParticipantAccount(session.participantId);
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    if (err.status === 422) return NextResponse.json({ error: "NO_IC" }, { status: 422 });
    if (err.status === 404) return NextResponse.json({ error: "PARTICIPANT_NOT_FOUND" }, { status: 404 });
    throw e;
  }

  return NextResponse.json({ ok: true });
}
