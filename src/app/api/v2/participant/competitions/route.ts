import { NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // Competitions the participant is registered in (via their teams)
  const memberships = await db.teamMember.findMany({
    where: { participantId: session.participantId },
    select: {
      team: {
        select: {
          id: true, name: true,
          competition: {
            select: {
              id: true, name: true, code: true, description: true,
              participationType: true, venue: true, address: true,
              startDate: true, endDate: true,
              registrationStart: true,
              theme: { select: { name: true, color: true, logoUrl: true } },
            },
          },
        },
      },
    },
  });

  // Deduplicate by competition id
  const seen = new Set<string>();
  const competitions = memberships
    .map(m => ({ team: m.team, competition: m.team.competition }))
    .filter(({ competition }) => {
      if (seen.has(competition.id)) return false;
      seen.add(competition.id);
      return true;
    });

  return NextResponse.json({ data: competitions });
}
