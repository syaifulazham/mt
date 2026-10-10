import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { DashboardClient } from "@/components/participant/DashboardClient";
import type { SlotScheduleConfig } from "@/lib/walkin-slots";
import { matchingTargetGroups } from "@/lib/targetGroupMatch";
import {
  quizzlyConfigured, quizzlyTokenStatuses, resolveQuizzlyAssignment,
  type QuizzlyQuizAssignment, type QuizzlyTokenLifecycle,
} from "@/lib/asiaspark-quizzly";
import { fc1 } from "@/lib/eptim-fc1";
import { droneArena } from "@/lib/eptim-drone";
import { arenaChallengeViews, type ArenaClient } from "@/lib/arena-client";

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
      fc1Access:     { select: { fc1UserId: true } },
    },
  });
  if (!participant) redirect("/participant/sign-in");

  // Teams: take 4 to detect if there are more than 3. TEAM competitions only —
  // individual entries (Asia Spark, FC-1) are one-person teams in the data
  // model and already have their own sections below.
  const teamMemberships = await db.teamMember.findMany({
    where: { participantId: session.participantId, team: { competition: { participationType: "TEAM" } } },
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
    where: { participantId: session.participantId, team: { competition: { participationType: "TEAM" } } },
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
      event: { select: { id: true, name: true, slug: true, startDate: true, endDate: true, allowMultipleParticipation: true } },
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
    select: { eventCompetitionId: true, tokenId: true, token: true, startUrl: true, quizTitle: true, expiresAt: true },
  });
  const tokenByEc = new Map(quizzlyTokens.map((t) => [t.eventCompetitionId, t]));

  // Token state comes from Quizzly, not from the expiry stored at issue time:
  // admins extend, revoke and regenerate codes, so the stored value goes stale
  // in both directions. One batch call covers all of this participant's tokens.
  // A failed check leaves tokens shown as stored (state null) rather than
  // offering a replacement we could not verify.
  const lifecycle: Map<string, QuizzlyTokenLifecycle> = quizzlyTokens.length > 0 && quizzlyConfigured()
    ? await quizzlyTokenStatuses(quizzlyTokens.map((t) => t.tokenId)).catch((e: unknown) => {
        console.error("[quizzly] token status check failed on dashboard:", (e as Error).message);
        return new Map();
      })
    : new Map();

  // ── Individual arena competitions (Eptim FC-1, individual Eptim Drone) ────
  // Individual competitions of the integration on open events, with challenges
  // picked by the organizer (Events → Pertandingan), filtered by the same
  // precise target-group rule as above. The participant may register any or
  // all of the picked challenges; per-challenge state (completed, attempts,
  // valid launch link) comes from the partner once they have a player.
  type ArenaChallengeRef = { id: string; name: string; challenge_mode: string; status: string };
  async function individualArenaCards(
    integration: "eptim-fc1" | "eptim-drone",
    client: ArenaClient,
    userid: string | null,
    registrations: { eventCompetitionId: string; challengeId: string; launchCode: string | null; launchUrl: string | null }[],
  ) {
    const links = await db.eventCompetition.findMany({
      where: {
        competition: { thirdPartyIntegration: integration, participationType: "INDIVIDUAL" },
        event: { status: { in: ["PUBLISHED", "ACTIVE"] } },
      },
      select: {
        id: true, fc1Challenges: true, droneChallenges: true,
        event: { select: { id: true, name: true, slug: true, startDate: true, endDate: true, allowMultipleParticipation: true } },
        competition: {
          select: {
            id: true, code: true, name: true,
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
    const cards = await Promise.all(links.map(async (ec) => {
      const picks = integration === "eptim-fc1" ? ec.fc1Challenges : ec.droneChallenges;
      const challenges = (picks as ArenaChallengeRef[] | null) ?? [];
      if (challenges.length === 0) return null;
      const matched = matchingTargetGroups(participant!, ec.competition.targetGroups.map((t) => t.targetGroup));
      if (matched.length === 0) return null;
      const regs = new Map(registrations.filter((r) => r.eventCompetitionId === ec.id).map((r) => [r.challengeId, r]));
      return {
        id:              ec.id,
        targetGroupName: matched[0].name,
        event: {
          id:        ec.event.id,
          name:      ec.event.name,
          slug:      ec.event.slug,
          startDate: ec.event.startDate?.toISOString() ?? null,
          endDate:   ec.event.endDate?.toISOString()   ?? null,
          allowMultipleParticipation: ec.event.allowMultipleParticipation,
        },
        competition: { id: ec.competition.id, code: ec.competition.code, name: ec.competition.name },
        challenges: await arenaChallengeViews(client, userid, challenges, regs),
      };
    }));
    return { links, cards: cards.filter((c) => c !== null) };
  }

  const regSelect = { eventCompetitionId: true, challengeId: true, launchCode: true, launchUrl: true } as const;
  const [fc1Registrations, droneRegistrations, droneAccess] = await Promise.all([
    db.participantFc1Challenge.findMany({ where: { participantId: session.participantId }, select: regSelect }),
    db.participantDroneChallenge.findMany({ where: { participantId: session.participantId }, select: regSelect }),
    db.droneAccess.findUnique({ where: { participantId: session.participantId }, select: { droneUserId: true } }),
  ]);
  const [fc1Individual, droneIndividual] = await Promise.all([
    individualArenaCards("eptim-fc1", fc1, participant.fc1Access?.fc1UserId ?? null, fc1Registrations),
    individualArenaCards("eptim-drone", droneArena, droneAccess?.droneUserId ?? null, droneRegistrations),
  ]);
  const fc1Links  = fc1Individual.links;
  const fc1Data   = fc1Individual.cards;
  const droneIndividualData = droneIndividual.cards;

  // ── Eptim Drone (team) ───────────────────────────────────────────────────
  // Same flow as FC-1, but Drone competitions are team competitions and the
  // Drone player is the team account: one card per (team, event-competition)
  // the participant's team is entered in, for open events where the organizer
  // picked Drone challenges. Team members share the registration and the link.
  const droneMemberships = await db.teamMember.findMany({
    where: {
      participantId: session.participantId,
      // TEAM competitions only: individual Drone entries are one-person teams in
      // the data model, and they have their own section (individual Drone).
      team: { competition: { thirdPartyIntegration: "eptim-drone", participationType: "TEAM" } },
    },
    select: {
      team: {
        select: {
          id: true, name: true, competitionId: true,
          droneAccess: { select: { droneUserId: true } },
          competition: { select: { id: true, code: true, name: true } },
          teamEvents: {
            where:  { event: { status: { in: ["PUBLISHED", "ACTIVE"] } } },
            select: {
              event: {
                select: {
                  id: true, name: true, startDate: true, endDate: true,
                  eventCompetitions: { select: { id: true, competitionId: true, droneChallenges: true } },
                },
              },
            },
          },
          droneChallenges: { select: { eventCompetitionId: true, challengeId: true, launchCode: true, launchUrl: true } },
        },
      },
    },
  });
  const droneData = (await Promise.all(droneMemberships.flatMap(({ team }) =>
    team.teamEvents.flatMap(({ event }) => {
      const ec = event.eventCompetitions.find((e) => e.competitionId === team.competitionId);
      const challenges = (ec?.droneChallenges as ArenaChallengeRef[] | null) ?? [];
      if (!ec || challenges.length === 0) return [];
      const regs = new Map(team.droneChallenges.filter((r) => r.eventCompetitionId === ec.id).map((r) => [r.challengeId, r]));
      return [(async () => ({
        id:          `${team.id}:${ec.id}`,
        teamId:      team.id,
        teamName:    team.name,
        eventCompetitionId: ec.id,
        event: {
          id: event.id, name: event.name,
          startDate: event.startDate?.toISOString() ?? null,
          endDate:   event.endDate?.toISOString()   ?? null,
        },
        competition: team.competition,
        challenges: await arenaChallengeViews(droneArena, team.droneAccess?.droneUserId ?? null, challenges, regs),
      }))()];
    }),
  )));

  // Competitions the participant is already entered in, per event shown in the
  // Quizzly or FC-1 sections — including entries made by a manager, not just
  // ones created here — so the "Penyertaan Tunggal Sahaja" lock reflects the
  // same facts the server enforces, across both integrations.
  const entryEventIds = [...new Set([...quizzlyLinks, ...fc1Links, ...droneIndividual.links].map((ec) => ec.event.id))];
  const entries = entryEventIds.length === 0 ? [] : await db.teamMember.findMany({
    where: {
      participantId: session.participantId,
      team: { teamEvents: { some: { eventId: { in: entryEventIds } } } },
    },
    select: {
      team: {
        select: {
          competition: { select: { id: true, code: true, name: true } },
          teamEvents:  { where: { eventId: { in: entryEventIds } }, select: { eventId: true } },
        },
      },
    },
  });
  const eventEntries: Record<string, { competitionId: string; label: string }[]> = {};
  for (const e of entries) {
    for (const te of e.team.teamEvents) {
      (eventEntries[te.eventId] ??= []).push({
        competitionId: e.team.competition.id,
        label:         `${e.team.competition.code} ${e.team.competition.name}`,
      });
    }
  }

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
        ? (() => {
            const live = lifecycle.get(issued.tokenId);
            return {
              token:     issued.token,
              startUrl:  issued.startUrl,
              quizTitle: issued.quizTitle,
              expiresAt: live?.expires_at ?? issued.expiresAt?.toISOString() ?? null,
              state:     live?.status ?? null,
              expiredUnused: live?.expired_unused === true,
            };
          })()
        : null,
      event: {
        id:        ec.event.id,
        name:      ec.event.name,
        slug:      ec.event.slug,
        startDate: ec.event.startDate?.toISOString() ?? null,
        endDate:   ec.event.endDate?.toISOString()   ?? null,
        allowMultipleParticipation: ec.event.allowMultipleParticipation,
      },
      competition: { id: ec.competition.id, code: ec.competition.code, name: ec.competition.name, theme: ec.competition.theme },
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
      eventEntries={eventEntries}
      fc1Competitions={fc1Data}
      droneTeams={droneData}
      droneIndividual={droneIndividualData}
      quizzlyRegistered={!!participant.quizzlyAccess}
      hasIc={!!participant.ic?.replace(/\D/g, "")}
    />
  );
}
