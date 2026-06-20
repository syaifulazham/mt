import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { eptimdrone } from "@/lib/eptim-drone";

export async function GET(_req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: {
      id: true, ic: true, name: true,
      contingent: { select: { id: true, name: true, state: { select: { name: true } } } },
    },
  });
  if (!participant || !participant.contingent)
    return NextResponse.json({ error: "PARTICIPANT_NOT_FOUND" }, { status: 404 });

  const icDigits = (participant.ic ?? "").replace(/\D/g, "");
  if (!icDigits) return NextResponse.json({ error: "NO_IC" }, { status: 422 });

  const contingentId = String(participant.contingent.id);

  const [sectorCheck, userCheck, existing] = await Promise.all([
    eptimdrone.checkSector(contingentId).catch(() => null),
    eptimdrone.checkUser(icDigits).catch(() => null),
    db.droneAccess.findUnique({ where: { participantId: session.participantId } }),
  ]);

  return NextResponse.json({
    sectorExists: sectorCheck ? !sectorCheck.available : null,
    userExists:   userCheck   ? !userCheck.available   : null,
    registered:   !!existing,
    contingentId,
    contingentName: participant.contingent.name,
    icDigits,
  });
}
