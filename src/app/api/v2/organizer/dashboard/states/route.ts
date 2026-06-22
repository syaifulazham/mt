import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const [states, competitions, allParticipants] = await Promise.all([
    db.state.findMany({ orderBy: { name: "asc" } }),
    db.competition.findMany({
      select: {
        id: true,
        targetGroups: {
          include: { targetGroup: { select: { schoolLevel: true, ppki: true } } },
        },
      },
    }),
    db.participant.findMany({
      select: {
        eduLevel: true,
        ppki: true,
        contingent: {
          select: {
            contingentType: true,
            stateId: true,
            school: { select: { stateId: true } },
          },
        },
      },
    }),
  ]);

  // Count participations per state (participant × eligible competition)
  const stateCount: Record<string, number> = {};
  for (const comp of competitions) {
    for (const p of allParticipants) {
      const eligible = comp.targetGroups.some((tg) => {
        const t = tg.targetGroup;
        if (t.schoolLevel.toUpperCase() !== p.eduLevel.toUpperCase()) return false;
        if (t.ppki && !p.ppki) return false;
        return true;
      });
      if (!eligible) continue;

      const c = p.contingent;
      const stateId = c?.contingentType === "SCHOOL" ? c.school?.stateId : c?.stateId;
      if (stateId) stateCount[stateId] = (stateCount[stateId] ?? 0) + 1;
    }
  }

  const data = states.map((state) => ({
    id: state.id,
    name: state.name,
    code: state.code,
    participantCount: stateCount[state.id] ?? 0,
  }));

  return NextResponse.json({ data });
}
