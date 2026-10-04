import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { matchingTargetGroups } from "@/lib/targetGroupMatch";
import { ensureIndividualEntry, singleParticipationConflict } from "@/lib/individualEntry";
import {
  quizzlyConfigured, quizzlyErrorMessage, quizzlyGetSession, quizzlyIssueToken, quizzlyResolveSessionQuizSetId,
  quizzlyTokenStatus, quizzlyTokenWindow, resolveQuizzlyAssignment,
  type QuizzlyQuizAssignment, type QuizzlyTokenStatus,
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

  // A token already exists for this quiz. Quizzly decides what happens next, not
  // the expiry stored here: admins can extend, revoke or regenerate codes, so a
  // stored expires_at goes stale in both directions.
  //   active / not yet valid → hand back the same code (no second code per quiz)
  //   redeemed               → refuse; the attempt was started or finished
  //   revoked                → refuse; re-issuing would undo an admin's decision
  //   expired                → lapsed unused, the only case that gets a new code
  const existing = await db.participantQuizzlyToken.findUnique({
    where: { participantId_eventCompetitionId: { participantId: participant.id, eventCompetitionId: ec.id } },
  });
  if (existing) {
    const current = (expiresAt: Date | null) => NextResponse.json({
      token:     existing.token,
      startUrl:  existing.startUrl,
      quizTitle: existing.quizTitle,
      expiresAt: expiresAt?.toISOString() ?? null,
    });

    let st: QuizzlyTokenStatus | null = null;
    try {
      st = await quizzlyTokenStatus(existing.tokenId);
    } catch (e: unknown) {
      const err = e as { message?: string; status?: number; detail?: string };
      console.error(
        `[quizzly] token status check failed for participant ${participant.id} token ${existing.tokenId}:`,
        err.message, "| upstream:", err.detail ?? "—",
      );
    }
    if (!st) {
      // Re-showing a code we already gave out is safe without Quizzly; issuing a
      // replacement is not — an unverified one could be a second attempt.
      if (existing.expiresAt && existing.expiresAt > new Date()) return current(existing.expiresAt);
      return NextResponse.json(
        { error: "Status token tidak dapat disemak sekarang. Cuba lagi sebentar." },
        { status: 502 },
      );
    }
    if (st.status === "redeemed")
      return NextResponse.json(
        { error: "Token ini telah digunakan. Hubungi penganjur jika anda perlu menduduki semula kuiz." },
        { status: 409 },
      );
    if (st.status === "revoked")
      return NextResponse.json(
        { error: "Token ini telah dibatalkan oleh penganjur. Hubungi penganjur." },
        { status: 409 },
      );
    if (st.status !== "expired") {
      // Still usable. Keep the stored expiry in step with Quizzly's, which an
      // admin may have extended.
      const upstream = st.expires_at ? new Date(st.expires_at) : null;
      if (upstream && upstream.getTime() !== existing.expiresAt?.getTime())
        await db.participantQuizzlyToken.update({ where: { id: existing.id }, data: { expiresAt: upstream } });
      return current(upstream ?? existing.expiresAt);
    }
  }

  try {
    // The code is issued in this event-competition's own session only, valid
    // until that round closes and not usable before it opens.
    const [qSession, sessionQuizSetId] = await Promise.all([
      quizzlyGetSession(ec.quizzlySessionId),
      assignment.sessionQuizSetId ?? quizzlyResolveSessionQuizSetId(ec.quizzlySessionId, assignment.quizId),
    ]);
    if (!qSession)
      return NextResponse.json(
        { error: "Sesi Asia Spark untuk pertandingan ini tidak ditemui. Hubungi penganjur." },
        { status: 409 },
      );
    const window = quizzlyTokenWindow(qSession);
    if (window.closed)
      return NextResponse.json({ error: "Pusingan kuiz ini telah ditutup." }, { status: 409 });

    const issued = await quizzlyIssueToken({
      personalId:       participant.quizzlyAccess.personalId,
      sessionQuizSetId,
      expiresInSeconds: window.expiresInSeconds,
      notBefore:        window.notBefore,
    });
    // Quizzly flags requests it considers malformed (e.g. no session bound).
    // The code is still issued, so log loudly rather than failing the student.
    if (issued.warnings?.length)
      console.warn(
        `[quizzly] issueToken warnings for participant ${participant.id} token ${issued.token_id}:`,
        issued.warnings.map((w) => w.code).join(", "),
      );

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
