import { NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { webcraftConfigured, webcraftUserExists, toWebcraftUserId } from "@/lib/eptim-webcraft";

// GET /api/v2/participant/webcraft/status
export async function GET() {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!webcraftConfigured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

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
