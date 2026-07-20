import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { DashboardClient } from "@/components/participant/DashboardClient";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await getParticipantSession();
  if (!session) redirect("/participant/sign-in");

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: {
      id: true,
      name: true,
      gender: true,
      eduLevel: true,
      classGrade: true,
      ppki: true,
      contingent: { select: { name: true, shortName: true } },
    },
  });
  if (!participant) redirect("/participant/sign-in");

  // Teams: take 4 to detect if there are more than 3
  const teamMemberships = await db.teamMember.findMany({
    where: { participantId: session.participantId },
    take: 4,
    orderBy: { createdAt: "desc" },
    select: {
      team: {
        select: {
          id: true,
          name: true,
          status: true,
          competition: { select: { id: true, code: true, name: true } },
          contingent:  { select: { name: true, shortName: true } },
        },
      },
    },
  });

  const totalTeams = await db.teamMember.count({
    where: { participantId: session.participantId },
  });

  const targetGroupFilter = {
    schoolLevel: participant.eduLevel,
    ...(participant.ppki ? {} : { ppki: false }),
  };

  // Eligible competitions: first 6
  const competitions = await db.competition.findMany({
    where: {
      targetGroups: { some: { targetGroup: targetGroupFilter } },
    },
    select: {
      id: true,
      code: true,
      name: true,
      participationType: true,
      theme: { select: { name: true, color: true } },
    },
    orderBy: { code: "asc" },
    take: 6,
  });

  const totalCompetitions = await db.competition.count({
    where: {
      targetGroups: { some: { targetGroup: targetGroupFilter } },
    },
  });

  // Enrolled competition IDs
  const memberships = await db.teamMember.findMany({
    where: { participantId: session.participantId },
    select: { team: { select: { competitionId: true } } },
  });
  const enrolledIds = new Set(memberships.map((m) => m.team.competitionId));

  // Walk-in competitions published to portal, matching target group
  const walkInLinks = await db.eventWalkInCompetition.findMany({
    where: {
      publishToPortal: true,
      competition: {
        targetGroups: { some: { targetGroup: targetGroupFilter } },
      },
    },
    select: {
      id: true,
      maxSlots: true,
      useViblockarena: true,
      _count: { select: { registrations: true } },
      event: {
        select: {
          id: true,
          name: true,
          slug: true,
          venue: true,
          startDate: true,
          endDate: true,
        },
      },
      competition: {
        select: { id: true, code: true, name: true, participationType: true },
      },
    },
    orderBy: [{ event: { startDate: "asc" } }, { competition: { code: "asc" } }],
  });

  // Existing walk-in registrations for this participant
  const existingRegs = await db.walkInRegistration.findMany({
    where: { participantId: session.participantId },
    select: { id: true, walkInCompetitionId: true, status: true, viblockToken: true },
  });

  // Serialize
  const teamsData = teamMemberships.map((m) => ({
    team: {
      id:          m.team.id,
      name:        m.team.name,
      status:      m.team.status,
      competition: m.team.competition,
      contingent:  m.team.contingent,
    },
  }));

  const competitionsData = competitions.map((c) => ({
    id:                c.id,
    code:              c.code,
    name:              c.name,
    participationType: c.participationType,
    theme:             c.theme,
    enrolled:          enrolledIds.has(c.id),
  }));

  const walkInData = walkInLinks.map((wic) => ({
    id:              wic.id,
    maxSlots:        wic.maxSlots,
    useViblockarena: wic.useViblockarena,
    registrations:   wic._count.registrations,
    event: {
      id:        wic.event.id,
      name:      wic.event.name,
      slug:      wic.event.slug,
      venue:     wic.event.venue,
      startDate: wic.event.startDate?.toISOString() ?? null,
      endDate:   wic.event.endDate?.toISOString()   ?? null,
    },
    competition: wic.competition,
  }));

  const existingRegistrations: Record<string, { id: string; status: string; viblockToken: string | null }> = {};
  for (const r of existingRegs) {
    existingRegistrations[r.walkInCompetitionId] = { id: r.id, status: r.status, viblockToken: r.viblockToken };
  }

  return (
    <DashboardClient
      participant={{
        id:         participant.id,
        name:       participant.name,
        gender:     participant.gender,
        eduLevel:   participant.eduLevel,
        classGrade: participant.classGrade,
        contingent: participant.contingent ?? { name: "—", shortName: null },
      }}
      teams={teamsData}
      totalTeams={totalTeams}
      competitions={competitionsData}
      totalCompetitions={totalCompetitions}
      walkInCompetitions={walkInData}
      existingRegistrations={existingRegistrations}
    />
  );
}
