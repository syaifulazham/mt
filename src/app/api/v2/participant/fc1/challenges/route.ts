import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { ensureIndividualEntry, singleParticipationConflict } from "@/lib/individualEntry";
import { fc1Configured, fc1ErrorMessage, fc1ExternalRef, fc1RegisterChallenge } from "@/lib/eptim-fc1";
import { challengeLaunchLink, ensureFc1Account, withSectorRepair } from "@/lib/fc1Participant";
import { loadFc1ChallengeAccess } from "@/lib/fc1ChallengeAccess";

/**
 * POST { eventCompetitionId, challengeId } — register for one FC-1 challenge,
 * and hand back a launch link so the participant can start straight away.
 *
 * One click does everything: the FC-1 player account is created on first use,
 * the challenge registration is made, and a single-use launch link is issued.
 *
 * Order: FC-1 first, then the local write. FC-1's register is idempotent (409
 * returns the existing registration), so if the local transaction ever fails
 * after FC-1 succeeded, the participant's retry heals it — whereas writing
 * locally first could leave a registration FC-1 never heard of. The local
 * transaction also enters the participant in the competition, so they appear on
 * the event's preregistration list.
 */
export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!fc1Configured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  const { eventCompetitionId, challengeId } =
    await req.json().catch(() => ({})) as { eventCompetitionId?: string; challengeId?: string };
  if (!eventCompetitionId || !challengeId)
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const access = await loadFc1ChallengeAccess(session.participantId, eventCompetitionId, challengeId);
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

  // ── FC-1: account (first use) + registration ─────────────────────────────
  let userid: string;
  let contingentId: string;
  try {
    ({ userid, contingentId } = await ensureFc1Account(participant.id));
    await withSectorRepair(userid, contingentId, () => fc1RegisterChallenge({
      challengeId, userid, externalRef: fc1ExternalRef(ec.id, participant.id),
    }));
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error(
      `[eptim-fc1] registerChallenge failed for participant ${participant.id} challenge ${challengeId}:`,
      err.message, "| upstream:", err.detail ?? "—",
    );
    if (err.status === 422) return NextResponse.json({ error: err.message }, { status: 422 });
    if (err.status === 404)
      return NextResponse.json(
        { error: "Akaun atau cabaran tidak ditemui di FC-1. Cuba lagi, atau hubungi penganjur." },
        { status: 404 },
      );
    return NextResponse.json({ error: fc1ErrorMessage(err) }, { status: err.status ?? 422 });
  }

  // ── Local ────────────────────────────────────────────────────────────────
  const now = new Date();
  const row = await db.$transaction(async (tx) => {
    const saved = await tx.participantFc1Challenge.upsert({
      where: {
        participantId_eventCompetitionId_challengeId: { participantId: participant.id, eventCompetitionId: ec.id, challengeId },
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
    return saved;
  });

  // The registration stands even if the link can't be issued right now; the
  // participant can ask for one from the dashboard.
  const link = await challengeLaunchLink(row, userid, contingentId).catch((e: unknown) => {
    console.error(`[eptim-fc1] launch link after register failed for participant ${participant.id}:`, (e as Error).message);
    return null;
  });

  return NextResponse.json({ ok: true, challengeId, link });
}
