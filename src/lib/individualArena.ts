import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { matchingTargetGroups } from "@/lib/targetGroupMatch";
import { ensureIndividualEntry, singleParticipationConflict } from "@/lib/individualEntry";
import { resolveLaunchLink, type ArenaClient } from "@/lib/arena-client";
import { fc1 } from "@/lib/eptim-fc1";
import { droneArena } from "@/lib/eptim-drone";
import { ensureFc1Account } from "@/lib/fc1Participant";
import { ensureDroneParticipantAccount } from "@/lib/droneTeam";

// The participant-side flow for INDIVIDUAL arena competitions — Eptim FC-1 and
// individual Eptim Drone competitions. Same steps for both:
//   Daftar  → player created on first use, challenge registered on the partner,
//             participant entered in the competition, launch link returned
//   link    → stored link while valid, else a new one; refused once completed
// Only the partner client, the player account and the registration table differ.

const VISIBLE_EVENT_STATUSES = ["PUBLISHED", "ACTIVE"];

type ArenaChallengeRef = { id: string; name: string; challenge_mode: string; status: string };
type RegRow = { id: string; launchCode: string | null; launchUrl: string | null };
type RegKey = { participantId: string; eventCompetitionId: string; challengeId: string };

export type IndividualArena = {
  integration: "eptim-fc1" | "eptim-drone";
  label: string;
  client: ArenaClient;
  /** Which EventCompetition column holds the organizer's picks. */
  picksOf: (ec: { fc1Challenges: Prisma.JsonValue; droneChallenges: Prisma.JsonValue }) => Prisma.JsonValue;
  ensureAccount: (participantId: string) => Promise<{ userid: string; contingentId: string }>;
  existingUserid: (participantId: string) => Promise<string | null>;
  regs: {
    find:     (key: RegKey) => Promise<RegRow | null>;
    upsert:   (tx: Prisma.TransactionClient, key: RegKey, challengeName: string, now: Date) => Promise<RegRow>;
    saveLink: (id: string, fresh: { code: string; url: string; expiresAt: Date }) => Promise<unknown>;
  };
};

export const FC1_INDIVIDUAL: IndividualArena = {
  integration: "eptim-fc1",
  label: "Eptim FC-1",
  client: fc1,
  picksOf: (ec) => ec.fc1Challenges,
  ensureAccount: ensureFc1Account,
  existingUserid: async (participantId) =>
    (await db.participantFc1Access.findUnique({ where: { participantId }, select: { fc1UserId: true } }))?.fc1UserId ?? null,
  regs: {
    find: (k) => db.participantFc1Challenge.findUnique({
      where:  { participantId_eventCompetitionId_challengeId: k },
      select: { id: true, launchCode: true, launchUrl: true },
    }),
    upsert: (tx, k, challengeName, now) => tx.participantFc1Challenge.upsert({
      where:  { participantId_eventCompetitionId_challengeId: k },
      create: { ...k, challengeName, fc1SyncedAt: now },
      update: { challengeName, fc1SyncedAt: now },
      select: { id: true, launchCode: true, launchUrl: true },
    }),
    saveLink: (id, f) => db.participantFc1Challenge.update({
      where: { id }, data: { launchCode: f.code, launchUrl: f.url, launchExpiresAt: f.expiresAt },
    }),
  },
};

export const DRONE_INDIVIDUAL: IndividualArena = {
  integration: "eptim-drone",
  label: "Eptim Drone",
  client: droneArena,
  picksOf: (ec) => ec.droneChallenges,
  ensureAccount: ensureDroneParticipantAccount,
  existingUserid: async (participantId) =>
    (await db.droneAccess.findUnique({ where: { participantId }, select: { droneUserId: true } }))?.droneUserId ?? null,
  regs: {
    find: (k) => db.participantDroneChallenge.findUnique({
      where:  { participantId_eventCompetitionId_challengeId: k },
      select: { id: true, launchCode: true, launchUrl: true },
    }),
    upsert: (tx, k, challengeName, now) => tx.participantDroneChallenge.upsert({
      where:  { participantId_eventCompetitionId_challengeId: k },
      create: { ...k, challengeName, droneSyncedAt: now },
      update: { challengeName, droneSyncedAt: now },
      select: { id: true, launchCode: true, launchUrl: true },
    }),
    saveLink: (id, f) => db.participantDroneChallenge.update({
      where: { id }, data: { launchCode: f.code, launchUrl: f.url, launchExpiresAt: f.expiresAt },
    }),
  },
};

/**
 * Whether a participant may act on one challenge: the competition uses this
 * integration and is individual, the event is open, the organizer picked the
 * challenge, and the participant is in a target group. Recomputed for every
 * action rather than trusted from the dashboard.
 */
export async function loadIndividualChallengeAccess(
  arena: IndividualArena, participantId: string, eventCompetitionId: string, challengeId: string,
) {
  const participant = await db.participant.findUnique({
    where:  { id: participantId },
    select: { id: true, name: true, contingentId: true, eduLevel: true, classGrade: true, ppki: true, age: true },
  });
  if (!participant) return { error: "NOT_FOUND", status: 404 } as const;

  const ec = await db.eventCompetition.findUnique({
    where: { id: eventCompetitionId },
    select: {
      id: true, eventId: true, competitionId: true, fc1Challenges: true, droneChallenges: true,
      event: { select: { status: true } },
      competition: {
        select: {
          thirdPartyIntegration: true, participationType: true,
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
  });
  if (!ec) return { error: "NOT_FOUND", status: 404 } as const;
  if (ec.competition.thirdPartyIntegration !== arena.integration || ec.competition.participationType !== "INDIVIDUAL")
    return { error: "NOT_INTEGRATED", status: 409 } as const;
  if (!VISIBLE_EVENT_STATUSES.includes(ec.event.status)) return { error: "Acara ini belum dibuka.", status: 409 } as const;

  const challenge = ((arena.picksOf(ec) as ArenaChallengeRef[] | null) ?? []).find((c) => c.id === challengeId);
  if (!challenge) return { error: "Cabaran ini tidak ditawarkan untuk pertandingan ini.", status: 404 } as const;

  if (matchingTargetGroups(participant, ec.competition.targetGroups.map((t) => t.targetGroup)).length === 0)
    return { error: "NOT_ELIGIBLE", status: 403 } as const;

  return { participant, ec, challenge } as const;
}

function launchLinkFor(arena: IndividualArena, row: RegRow, userid: string, contingentId: string) {
  return resolveLaunchLink(arena.client, row, userid, contingentId, (fresh) => arena.regs.saveLink(row.id, fresh));
}

/** Stable reference MT sends as `external_ref`, so partner rows trace back here. */
function externalRef(eventCompetitionId: string, participantId: string) {
  return `mt:${eventCompetitionId}:${participantId}`;
}

async function readBody(req: NextRequest) {
  const { eventCompetitionId, challengeId } =
    await req.json().catch(() => ({})) as { eventCompetitionId?: string; challengeId?: string };
  return eventCompetitionId && challengeId ? { eventCompetitionId, challengeId } : null;
}

/**
 * POST { eventCompetitionId, challengeId } — register for one challenge and get
 * a launch link, in one click.
 *
 * Order: partner first, then the local write. The partner's register is
 * idempotent (409 returns the existing registration), so a failure after it
 * accepted is healed by a retry, while the reverse order could leave
 * registrations the partner never heard of. The local transaction also enters
 * the participant in the competition, so they appear on preregistration.
 */
export function individualRegisterHandler(arena: IndividualArena) {
  return async function POST(req: NextRequest) {
    const session = await getParticipantSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    if (!arena.client.configured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

    const access = await loadIndividualChallengeAccess(arena, session.participantId, body.eventCompetitionId, body.challengeId);
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
    const { participant, ec, challenge } = access;

    // Another challenge of the SAME competition is not a second participation;
    // another competition of a single-participation event is.
    const conflict = await singleParticipationConflict(db, {
      participantId: participant.id, eventId: ec.eventId, exceptCompetitionId: ec.competitionId,
    });
    if (conflict)
      return NextResponse.json(
        { error: `Acara ini membenarkan satu penyertaan sahaja — anda telah didaftarkan dalam ${conflict}.` },
        { status: 409 },
      );

    let userid: string;
    let contingentId: string;
    try {
      ({ userid, contingentId } = await arena.ensureAccount(participant.id));
      await arena.client.withSectorRepair(userid, contingentId, () => arena.client.registerChallenge({
        challengeId: body.challengeId, userid, externalRef: externalRef(ec.id, participant.id),
      }));
    } catch (e: unknown) {
      const err = e as { message?: string; status?: number; detail?: string };
      console.error(
        `[${arena.integration}] registerChallenge failed for participant ${participant.id} challenge ${body.challengeId}:`,
        err.message, "| upstream:", err.detail ?? "—",
      );
      if (err.status === 422) return NextResponse.json({ error: err.message }, { status: 422 });
      if (err.status === 404)
        return NextResponse.json(
          { error: `Akaun atau cabaran tidak ditemui di ${arena.label}. Cuba lagi, atau hubungi penganjur.` },
          { status: 404 },
        );
      return NextResponse.json({ error: arena.client.errorMessage(err) }, { status: err.status ?? 422 });
    }

    const key = { participantId: participant.id, eventCompetitionId: ec.id, challengeId: body.challengeId };
    const row = await db.$transaction(async (tx) => {
      const saved = await arena.regs.upsert(tx, key, challenge.name, new Date());
      await ensureIndividualEntry(tx, {
        participant:   { id: participant.id, name: participant.name, contingentId: participant.contingentId },
        competitionId: ec.competitionId,
        eventId:       ec.eventId,
      });
      return saved;
    });

    // The registration stands even if the link can't be issued right now; the
    // dashboard offers "Mohon pautan baharu".
    const link = await launchLinkFor(arena, row, userid, contingentId).catch((e: unknown) => {
      console.error(`[${arena.integration}] launch link after register failed for participant ${participant.id}:`, (e as Error).message);
      return null;
    });
    return NextResponse.json({ ok: true, challengeId: body.challengeId, link });
  };
}

/**
 * POST { eventCompetitionId, challengeId } — the launch link for a registered
 * challenge: the current one while the partner reports it valid, otherwise a
 * new one. Refused once the challenge is completed or no attempts are left.
 */
export function individualLinkHandler(arena: IndividualArena) {
  return async function POST(req: NextRequest) {
    const session = await getParticipantSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    if (!arena.client.configured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

    const access = await loadIndividualChallengeAccess(arena, session.participantId, body.eventCompetitionId, body.challengeId);
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
    const { participant } = access;

    const [userid, row] = await Promise.all([
      arena.existingUserid(participant.id),
      arena.regs.find({ participantId: participant.id, ...body }),
    ]);
    if (!userid || !row) return NextResponse.json({ error: "Daftar cabaran ini dahulu." }, { status: 409 });

    try {
      const attempts = await arena.client.attempts(body.challengeId, userid);
      if (attempts.completed)
        return NextResponse.json({ error: "Anda telah menyelesaikan cabaran ini." }, { status: 409 });
      if (attempts.attempts_remaining === 0)
        return NextResponse.json({ error: "Cubaan untuk cabaran ini telah habis." }, { status: 409 });
      return NextResponse.json({ link: await launchLinkFor(arena, row, userid, participant.contingentId) });
    } catch (e: unknown) {
      const err = e as { message?: string; status?: number; detail?: string };
      console.error(
        `[${arena.integration}] challenge link failed for participant ${participant.id} challenge ${body.challengeId}:`,
        err.message, "| upstream:", err.detail ?? "—",
      );
      return NextResponse.json({ error: arena.client.errorMessage(err) }, { status: err.status ?? 422 });
    }
  };
}
