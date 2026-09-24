import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { DashboardClient } from "@/components/participant/DashboardClient";
import type { SlotScheduleConfig } from "@/lib/walkin-slots";
import { matchingTargetGroups } from "@/lib/targetGroupMatch";
import { resolveQuizzlyAssignment, type QuizzlyQuizAssignment } from "@/lib/asiaspark-quizzly";

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
      age: true,
      ic: true,
      contingent: { select: { name: true, shortName: true } },
      quizzlyAccess: { select: { personalId: true } },
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
      event: { status: { in: ["PUBLISHED", "ACTIVE"] } },
      competition: {
        targetGroups: { some: { targetGroup: targetGroupFilter } },
      },
    },
    select: {
      id: true,
      maxSlots: true,
      useViblockarena: true,
      walkInSlotSchedule: true,
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

  // ── Asia Spark Quizzly ──────────────────────────────────────────────────
  // Event-competitions whose competition is Quizzly-integrated and which have a
  // session configured. Eligibility is the precise target-group rule (class
  // grade / age range), not just the school-level filter used above, because the
  // quiz a participant sits is chosen by exactly that.
  const quizzlyLinks = await db.eventCompetition.findMany({
    where: {
      quizzlySessionId: { not: null },
      competition: { thirdPartyIntegration: "asiaspark-quizzly" },
      event: { status: { in: ["PUBLISHED", "ACTIVE"] } },
    },
    select: {
      id: true,
      quizzlySessionTitle: true,
      quizzlyAssignBy: true,
      quizzlyQuizMap: true,
      event: { select: { id: true, name: true, slug: true, startDate: true, endDate: true } },
      competition: {
        select: {
          id: true, code: true, name: true,
          theme: { select: { name: true, color: true } },
          targetGroups: {
            select: {
              targetGroup: {
                select: { id: true, name: true, schoolLevel: true, ppki: true, classGrades: true, minAge: true, maxAge: true },
              },
            },
          },
        },
      },
    },
    orderBy: [{ event: { startDate: "asc" } }, { competition: { code: "asc" } }],
  });

  const quizzlyTokens = await db.participantQuizzlyToken.findMany({
    where:  { participantId: session.participantId },
    select: { eventCompetitionId: true, token: true, startUrl: true, quizTitle: true, expiresAt: true },
  });
  const tokenByEc = new Map(quizzlyTokens.map((t) => [t.eventCompetitionId, t]));

  const quizzlyData = quizzlyLinks.flatMap((ec) => {
    const groups  = ec.competition.targetGroups.map((tg) => tg.targetGroup);
    const matched = matchingTargetGroups(participant, groups);
    if (matched.length === 0) return [];

    const map = (ec.quizzlyQuizMap as QuizzlyQuizAssignment[] | null) ?? [];
    const assignment = resolveQuizzlyAssignment(map, ec.quizzlyAssignBy, matched, participant.classGrade);

    const issued = tokenByEc.get(ec.id);

    return [{
      id:              ec.id,
      sessionTitle:    ec.quizzlySessionTitle,
      assignBy:        ec.quizzlyAssignBy,
      targetGroupName: matched[0].name,
      quiz:            assignment ? { id: assignment.quizId, title: assignment.quizTitle, grade: assignment.grade } : null,
      token: issued
        ? {
            token:     issued.token,
            startUrl:  issued.startUrl,
            quizTitle: issued.quizTitle,
            expiresAt: issued.expiresAt?.toISOString() ?? null,
          }
        : null,
      event: {
        id:        ec.event.id,
        name:      ec.event.name,
        slug:      ec.event.slug,
        startDate: ec.event.startDate?.toISOString() ?? null,
        endDate:   ec.event.endDate?.toISOString()   ?? null,
      },
      competition: ec.competition,
    }];
  });

  // Existing walk-in registrations for this participant
  const existingRegs = await db.walkInRegistration.findMany({
    where: { participantId: session.participantId },
    select: { id: true, walkInCompetitionId: true, status: true, viblockToken: true, sessionNumber: true, slotNumber: true },
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
    walkInSlotSchedule: (wic.walkInSlotSchedule ?? null) as SlotScheduleConfig | null,
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

  const existingRegistrations: Record<string, { id: string; status: string; viblockToken: string | null; sessionNumber: number | null; slotNumber: number | null }> = {};
  for (const r of existingRegs) {
    existingRegistrations[r.walkInCompetitionId] = { id: r.id, status: r.status, viblockToken: r.viblockToken, sessionNumber: r.sessionNumber, slotNumber: r.slotNumber };
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
      quizzlyCompetitions={quizzlyData}
      quizzlyRegistered={!!participant.quizzlyAccess}
      quizzlyCanRegister={!!participant.ic?.replace(/\D/g, "")}
    />
  );
}
