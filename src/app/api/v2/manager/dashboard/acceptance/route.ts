import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

// GET — events with needManagerAcceptance=true where this manager's teams are registered
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  if (contingentIds.length === 0) return NextResponse.json({ data: [] });

  // Find team_events for this manager's teams in needManagerAcceptance events
  const teamEvents = await db.teamEvent.findMany({
    where: {
      event: { needManagerAcceptance: true },
      team:  { contingentId: { in: contingentIds } },
    },
    include: {
      event: {
        select: {
          id: true, name: true, slug: true, status: true,
          startDate: true, endDate: true, venue: true,
          description: true, address: true, city: true,
          zone:  { select: { name: true } },
          state: { select: { name: true } },
        },
      },
      team: {
        select: {
          id: true, name: true,
          contingent: { select: { name: true } },
          competition: { select: { id: true, code: true, name: true } },
          members: {
            include: {
              participant: {
                select: { id: true, name: true, ic: true, gender: true, eduLevel: true, classGrade: true },
              },
            },
            orderBy: { createdAt: "asc" },
          },
          trainers: {
            include: {
              trainer: { select: { id: true, name: true, phoneNumber: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
    orderBy: [
      { event: { startDate: "asc" } },
      { team: { competition: { code: "asc" } } },
      { team: { name: "asc" } },
    ],
  });

  // Group by event
  const eventMap = new Map<string, {
    event: typeof teamEvents[0]["event"];
    teams: Array<{
      teamEventId: string;
      teamId: string;
      teamName: string;
      competitionId: string;
      competitionCode: string;
      competitionName: string;
      contingentName: string;
      acceptance: string;
      members: Array<{ id: string; name: string; ic: string | null; gender: string; eduLevel: string; classGrade: string | null }>;
      trainers: Array<{ id: string; name: string; phoneNumber: string | null }>;
    }>;
  }>();

  for (const te of teamEvents) {
    if (!eventMap.has(te.eventId)) {
      eventMap.set(te.eventId, { event: te.event, teams: [] });
    }
    eventMap.get(te.eventId)!.teams.push({
      teamEventId:     te.id,
      teamId:          te.team.id,
      teamName:        te.team.name,
      competitionId:   te.team.competition.id,
      competitionCode: te.team.competition.code,
      competitionName: te.team.competition.name,
      contingentName:  te.team.contingent?.name ?? "",
      acceptance:      te.acceptance,
      members:         te.team.members.map((m) => ({
        id:         m.participant.id,
        name:       m.participant.name,
        ic:         m.participant.ic,
        gender:     m.participant.gender,
        eduLevel:   m.participant.eduLevel,
        classGrade: m.participant.classGrade,
      })),
      trainers: te.team.trainers.map((t) => ({
        id:          t.trainer.id,
        name:        t.trainer.name,
        phoneNumber: t.trainer.phoneNumber,
      })),
    });
  }

  return NextResponse.json({ data: [...eventMap.values()] });
}
