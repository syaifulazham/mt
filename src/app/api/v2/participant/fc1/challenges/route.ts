import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { matchingTargetGroups } from "@/lib/targetGroupMatch";
import { ensureIndividualEntry, singleParticipationConflict } from "@/lib/individualEntry";
import {
  fc1AssignMember, fc1Configured, fc1ErrorMessage, fc1ExternalRef, fc1RegisterChallenge,
} from "@/lib/eptim-fc1";

const VISIBLE_EVENT_STATUSES = ["PUBLISHED", "ACTIVE"];

type Fc1ChallengeRef = { id: string; name: string; challenge_mode: string; status: string };

/**
 * POST { eventCompetitionId, challengeId } — register for one FC-1 challenge.
 *
 * Everything that decides whether the participant may register is recomputed
 * here — eligibility by target group, that the challenge is one the organizer
 * configured for this event-competition, that the event is open, and the
 * event's Penyertaan rule — rather than trusted from the dashboard.
 *
 * Order: FC-1 first, then the local write. FC-1's register is idempotent (409
 * returns the existing registration), so if the local transaction ever fails
 * after FC-1 succeeded, the participant's retry heals it — whereas writing
 * locally first could leave a registration FC-1 never heard of. The local
 * transaction records it with fc1SyncedAt and enters the participant in the
 * competition, so they appear on the event's preregistration list.
 */
export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!fc1Configured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  const { eventCompetitionId, challengeId } =
    await req.json().catch(() => ({})) as { eventCompetitionId?: string; challengeId?: string };
  if (!eventCompetitionId || !challengeId)
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: {
      id: true, name: true, contingentId: true,
      eduLevel: true, classGrade: true, ppki: true, age: true,
      fc1Access: { select: { fc1UserId: true } },
    },
  });
  if (!participant) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!participant.fc1Access)
    return NextResponse.json({ error: "Daftar akaun FC-1 dahulu." }, { status: 409 });

  const ec = await db.eventCompetition.findUnique({
    where: { id: eventCompetitionId },
    select: {
      id: true, eventId: true, competitionId: true, fc1Challenges: true,
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
  if (!ec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (ec.competition.thirdPartyIntegration !== "eptim-fc1")
    return NextResponse.json({ error: "NOT_INTEGRATED" }, { status: 409 });
  if (!VISIBLE_EVENT_STATUSES.includes(ec.event.status))
    return NextResponse.json({ error: "Acara ini belum dibuka." }, { status: 409 });

  const challenge = ((ec.fc1Challenges as Fc1ChallengeRef[] | null) ?? []).find((c) => c.id === challengeId);
  if (!challenge)
    return NextResponse.json({ error: "Cabaran ini tidak ditetapkan untuk pertandingan ini." }, { status: 404 });

  if (matchingTargetGroups(participant, ec.competition.targetGroups.map((t) => t.targetGroup)).length === 0)
    return NextResponse.json({ error: "NOT_ELIGIBLE" }, { status: 403 });

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

  // ── FC-1 ─────────────────────────────────────────────────────────────────
  const userid = participant.fc1Access.fc1UserId;
  const register = () => fc1RegisterChallenge({
    challengeId, userid, externalRef: fc1ExternalRef(ec.id, participant.id),
  });
  try {
    try {
      await register();
    } catch (e: unknown) {
      // 403 = the player is in no sector of the event. Membership is normally
      // made at account registration; restore it (sector = contingent) and retry.
      if ((e as { status?: number }).status !== 403) throw e;
      await fc1AssignMember(participant.contingentId, userid).catch((err: { status?: number }) => {
        if (err.status !== 409) throw err;
      });
      await register();
    }
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error(
      `[eptim-fc1] registerChallenge failed for participant ${participant.id} (${userid}) challenge ${challengeId}:`,
      err.message, "| upstream:", err.detail ?? "—",
    );
    if (err.status === 404)
      return NextResponse.json(
        { error: "Akaun atau cabaran tidak ditemui di FC-1. Cuba daftar akaun FC-1 semula, atau hubungi penganjur." },
        { status: 404 },
      );
    return NextResponse.json({ error: fc1ErrorMessage(err) }, { status: err.status ?? 422 });
  }

  // ── Local ────────────────────────────────────────────────────────────────
  const now = new Date();
  const registration = await db.$transaction(async (tx) => {
    const row = await tx.participantFc1Challenge.upsert({
      where: {
        participantId_eventCompetitionId_challengeId: {
          participantId: participant.id, eventCompetitionId: ec.id, challengeId,
        },
      },
      create: {
        participantId: participant.id, eventCompetitionId: ec.id, challengeId,
        challengeName: challenge.name, fc1SyncedAt: now,
      },
      update: { challengeName: challenge.name, fc1SyncedAt: now },
    });
    if (ec.competition.participationType === "INDIVIDUAL") {
      await ensureIndividualEntry(tx, {
        participant:   { id: participant.id, name: participant.name, contingentId: participant.contingentId },
        competitionId: ec.competitionId,
        eventId:       ec.eventId,
      });
    }
    return row;
  });

  return NextResponse.json({
    ok: true,
    challengeId: registration.challengeId,
    registeredAt: registration.createdAt.toISOString(),
    syncedToFc1: !!registration.fc1SyncedAt,
  });
}
