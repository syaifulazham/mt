import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { matchingTargetGroups } from "@/lib/targetGroupMatch";
import { ensureIndividualEntry, singleParticipationConflict } from "@/lib/individualEntry";
import {
  quizzlyConfigured, quizzlyErrorMessage, quizzlyIssueToken, quizzlyTokenStatus,
  resolveQuizzlyAssignment, type QuizzlyQuizAssignment,
} from "@/lib/asiaspark-quizzly";

const VISIBLE_EVENT_STATUSES = ["PUBLISHED", "ACTIVE"] as const;

/**
 * POST { eventCompetitionId } — mint this participant's login token.
 *
 * Eligibility and the quiz itself are recomputed here from the target-group
 * rule rather than taken from the request: the client knows which quiz it
 * displayed, but only the server decides which one a participant may sit.
 */
export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!quizzlyConfigured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  const { eventCompetitionId } = await req.json().catch(() => ({})) as { eventCompetitionId?: string };
  if (!eventCompetitionId) return NextResponse.json({ error: "MISSING_EVENT_COMPETITION_ID" }, { status: 400 });

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: {
      id: true, name: true, contingentId: true,
      eduLevel: true, classGrade: true, ppki: true, age: true,
      quizzlyAccess: true,
    },
  });
  if (!participant) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!participant.quizzlyAccess)
    return NextResponse.json({ error: "NOT_REGISTERED" }, { status: 409 });

  const ec = await db.eventCompetition.findUnique({
    where: { id: eventCompetitionId },
    select: {
      id: true, eventId: true, competitionId: true,
      quizzlySessionId: true, quizzlyAssignBy: true, quizzlyQuizMap: true,
      event: { select: { status: true } },
      competition: {
        select: {
          thirdPartyIntegration: true,
          participationType: true,
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
  if (ec.competition.thirdPartyIntegration !== "asiaspark-quizzly" || !ec.quizzlySessionId)
    return NextResponse.json({ error: "NOT_INTEGRATED" }, { status: 409 });
  if (!VISIBLE_EVENT_STATUSES.includes(ec.event.status as (typeof VISIBLE_EVENT_STATUSES)[number]))
    return NextResponse.json({ error: "EVENT_NOT_OPEN" }, { status: 409 });

  const matched = matchingTargetGroups(participant, ec.competition.targetGroups.map((t) => t.targetGroup));
  if (matched.length === 0) return NextResponse.json({ error: "NOT_ELIGIBLE" }, { status: 403 });

  const assignment = resolveQuizzlyAssignment(
    (ec.quizzlyQuizMap as QuizzlyQuizAssignment[] | null) ?? [],
    ec.quizzlyAssignBy,
    matched,
    participant.classGrade,
  );
  if (!assignment) return NextResponse.json({ error: "NO_QUIZ_ASSIGNED" }, { status: 409 });

  // The event's "Penyertaan" rule, checked before minting: a refused request
  // must not leave a live token behind in Quizzly.
  if (ec.competition.participationType === "INDIVIDUAL") {
    const conflict = await singleParticipationConflict(db, {
      participantId:       participant.id,
      eventId:             ec.eventId,
      exceptCompetitionId: ec.competitionId,
    });
    if (conflict)
      return NextResponse.json(
        { error: `Acara ini membenarkan satu penyertaan sahaja — anda telah didaftarkan dalam ${conflict}.` },
        { status: 409 },
      );
  }

  // A token already exists for this quiz: hand it back while it is still valid,
  // and replace it only once Quizzly confirms it lapsed without ever being
  // redeemed. Without this check, calling the route directly after sitting the
  // quiz would mint a second, fresh attempt.
  const existing = await db.participantQuizzlyToken.findUnique({
    where: { participantId_eventCompetitionId: { participantId: participant.id, eventCompetitionId: ec.id } },
  });
  if (existing) {
    const current = NextResponse.json({
      token:     existing.token,
      startUrl:  existing.startUrl,
      quizTitle: existing.quizTitle,
      expiresAt: existing.expiresAt?.toISOString() ?? null,
    });
    if (existing.expiresAt && existing.expiresAt > new Date()) return current;

    let state: string;
    try {
      state = (await quizzlyTokenStatus(existing.tokenId)).status;
    } catch (e: unknown) {
      const err = e as { message?: string; status?: number; detail?: string };
      console.error(
        `[quizzly] token status check failed for participant ${participant.id} token ${existing.tokenId}:`,
        err.message, "| upstream:", err.detail ?? "—",
      );
      // Fail closed: an unverified replacement could be a second attempt.
      return NextResponse.json(
        { error: "Status token tidak dapat disemak sekarang. Cuba lagi sebentar." },
        { status: 502 },
      );
    }
    if (state === "redeemed")
      return NextResponse.json(
        { error: "Token ini telah digunakan. Hubungi penganjur jika anda perlu menduduki semula kuiz." },
        { status: 409 },
      );
    if (state === "revoked")
      return NextResponse.json(
        { error: "Token ini telah dibatalkan oleh penganjur. Hubungi penganjur." },
        { status: 409 },
      );
    // Clock skew between us and Quizzly: it still considers the token live.
    if (state !== "expired") return current;
  }

  try {
    const issued = await quizzlyIssueToken({
      personalId:           participant.quizzlyAccess.personalId,
      quizId:               assignment.quizId,
      competitionSessionId: ec.quizzlySessionId,
    });

    const tokenData = {
      quizId: assignment.quizId, quizTitle: issued.quiz?.title ?? assignment.quizTitle,
      tokenId: issued.token_id, token: issued.token,
      startUrl: issued.start_url, expiresAt: issued.expires_at ? new Date(issued.expires_at) : null,
    };

    // The token row and the competition entry are written together: a
    // participant holding a token must also be on the event's preregistration
    // list, or the organizer's numbers stop matching Quizzly's.
    const row = await db.$transaction(async (tx) => {
      // One row per (participant, event-competition): tokens are single-use, so
      // a re-issue supersedes whatever was there.
      const saved = await tx.participantQuizzlyToken.upsert({
        where:  { participantId_eventCompetitionId: { participantId: participant.id, eventCompetitionId: ec.id } },
        create: { participantId: participant.id, eventCompetitionId: ec.id, ...tokenData },
        update: tokenData,
      });

      // Asia Spark competitions are individual: every successful token request
      // enters the participant as a team of one and joins it to the event.
      if (ec.competition.participationType === "INDIVIDUAL") {
        await ensureIndividualEntry(tx, {
          participant:   { id: participant.id, name: participant.name, contingentId: participant.contingentId },
          competitionId: ec.competitionId,
          eventId:       ec.eventId,
        });
      }
      return saved;
    });

    return NextResponse.json({
      token:     row.token,
      startUrl:  row.startUrl,
      quizTitle: row.quizTitle,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error(
      `[quizzly] issueToken failed for participant ${participant.id} quiz ${assignment.quizId}:`,
      err.message, "| upstream:", err.detail ?? "—",
    );
    return NextResponse.json({ error: quizzlyErrorMessage(err) }, { status: err.status ?? 422 });
  }
}
