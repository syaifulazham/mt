import { NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const memberships = await db.teamMember.findMany({
    where: { participantId: session.participantId },
    include: {
      team: {
        include: {
          competition: {
            select: {
              id: true, name: true, code: true, participationType: true,
              venue: true, startDate: true, endDate: true,
              theme: { select: { name: true, color: true } },
            },
          },
          members: {
            include: {
              participant: { select: { id: true, name: true, gender: true } },
            },
          },
          trainers: {
            include: {
              trainer: { select: { id: true, name: true, phoneNumber: true } },
            },
          },
        },
      },
    },
  });

  return NextResponse.json({ data: memberships.map(m => m.team) });
}
