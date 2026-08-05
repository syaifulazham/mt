import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const eventId = new URL(req.url).searchParams.get("eventId") ?? null;

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  if (contingentIds.length === 0) return NextResponse.json({ data: null });

  const contingent = await db.contingent.findFirst({
    where: { id: { in: contingentIds } },
    include: {
      school: {
        include: {
          district: { select: { name: true } },
          zone:     { select: { name: true } },
          state:    { select: { name: true } },
        },
      },
      higherInstitution: {
        include: {
          state: { select: { name: true } },
        },
      },
    },
  });

  // Only teams in events that require manager acceptance; exclude DRAFT (not yet published) events.
  const teamEvents = await db.teamEvent.findMany({
    where: {
      event: { needManagerAcceptance: true, status: { not: "DRAFT" }, ...(eventId ? { id: eventId } : {}) },
      team:  { contingentId: { in: contingentIds } },
    },
    include: {
      event: {
        select: {
          id: true, name: true, slug: true,
          startDate: true, endDate: true, venue: true,
        },
      },
      team: {
        select: {
          id: true, name: true,
          competition: { select: { code: true, name: true } },
          members: {
            include: {
              participant: {
                select: { name: true, ic: true, gender: true, eduLevel: true, classGrade: true },
              },
            },
            orderBy: { createdAt: "asc" },
          },
          trainers: {
            include: {
              trainer: { select: { name: true, phoneNumber: true, email: true } },
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
    event: (typeof teamEvents)[0]["event"];
    teams: Array<{
      teamId: string; teamName: string;
      competitionCode: string; competitionName: string;
      acceptance: string;
      members: Array<{ name: string; ic: string | null; gender: string; eduLevel: string; classGrade: string | null }>;
      trainers: Array<{ name: string; phoneNumber: string | null; email: string | null }>;
    }>;
  }>();

  for (const te of teamEvents) {
    if (!eventMap.has(te.eventId)) eventMap.set(te.eventId, { event: te.event, teams: [] });
    eventMap.get(te.eventId)!.teams.push({
      teamId:          te.team.id,
      teamName:        te.team.name,
      competitionCode: te.team.competition.code,
      competitionName: te.team.competition.name,
      acceptance:      te.acceptance,
      members:  te.team.members.map((m) => ({
        name:       m.participant.name,
        ic:         m.participant.ic,
        gender:     m.participant.gender,
        eduLevel:   m.participant.eduLevel,
        classGrade: m.participant.classGrade,
      })),
      trainers: te.team.trainers.map((t) => ({
        name:        t.trainer.name,
        phoneNumber: t.trainer.phoneNumber,
        email:       t.trainer.email,
      })),
    });
  }

  const sch = contingent?.school;
  const hi  = contingent?.higherInstitution;

  return NextResponse.json({
    contingentName: contingent?.name ?? manager.name,
    contingentType: contingent?.contingentType ?? "UNKNOWN",
    school: sch ? {
      name:     sch.name,
      code:     sch.code,
      level:    sch.level,
      category: sch.category,
      district: sch.district?.name ?? null,
      zone:     sch.zone?.name ?? null,
      state:    sch.state?.name ?? null,
    } : null,
    institution: hi ? {
      name:  hi.name,
      state: hi.state?.name ?? null,
    } : null,
    events: [...eventMap.values()],
  });
}
