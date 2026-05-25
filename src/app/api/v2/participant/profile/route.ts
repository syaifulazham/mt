import { NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: {
      id: true, name: true, ic: true, email: true, phoneNumber: true,
      gender: true, age: true, eduLevel: true, classGrade: true, className: true,
      ppki: true, status: true,
      contingent: { select: { id: true, name: true, contingentType: true } },
    },
  });

  return NextResponse.json({ data: participant });
}
