import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  quizzlyConfigured, quizzlySessionProgress,
  type QuizzlyAttemptProgress, type QuizzlyProgressRow, type QuizzlyQuizAssignment,
} from "@/lib/asiaspark-quizzly";
import type { QuizzlyCell } from "@/lib/quizzlyCell";

// When a participant holds several quizzes in one competition (e.g. a re-assigned
// grade), the furthest attempt is the one a teacher cares about.
const RANK: Record<QuizzlyAttemptProgress, number> = { submitted: 4, in_progress: 3, logged_in: 2, not_started: 1, voided: 0 };

/**
 * GET /api/v2/manager/individuals/quizzly-progress
 *
 * For the manager's contingents: Asia Spark codes issued and how far each
 * entered participant has got, keyed `data[eventCompetitionId][participantId]`.
 * The Individuals page renders from mt alone and calls this after first paint,
 * so a slow Quizzly never delays it. Entries are recomputed here from the
 * manager's own contingents — nothing is taken from the request.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!quizzlyConfigured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  const manager = await db.managerProfile.findUnique({
    where:  { clerkUserId: userId },
    select: { contingentManagers: { where: { status: "ACTIVE" }, select: { contingentId: true } } },
  });
  const contingentIds = manager?.contingentManagers.map((c) => c.contingentId) ?? [];
  if (contingentIds.length === 0) return NextResponse.json({ data: {} });

  const ecs = await db.eventCompetition.findMany({
    where: {
      quizzlySessionId: { not: null },
      event:            { status: { notIn: ["DRAFT", "ARCHIVE", "CANCELLED"] } },
      competition:      { thirdPartyIntegration: "asiaspark-quizzly", participationType: "INDIVIDUAL" },
    },
    select: { id: true, eventId: true, competitionId: true, quizzlySessionId: true, quizzlyQuizMap: true },
  });
  if (ecs.length === 0) return NextResponse.json({ data: {} });

  const entries = await db.teamEvent.findMany({
    where: {
      eventId: { in: [...new Set(ecs.map((e) => e.eventId))] },
      team: { contingentId: { in: contingentIds }, competitionId: { in: [...new Set(ecs.map((e) => e.competitionId))] } },
    },
    select: {
      eventId: true,
      team: {
        select: {
          competitionId: true,
          members: { select: { participant: { select: { id: true, quizzlyAccess: { select: { quizzlyParticipantId: true } } } } } },
        },
      },
    },
  });

  // (ec, participant) pairs, and the Quizzly ids each session must be asked about.
  const ecByPair = new Map(ecs.map((e) => [`${e.eventId}:${e.competitionId}`, e]));
  const pairs: { ec: (typeof ecs)[number]; participantId: string; quizzlyId: string | null }[] = [];
  const idsBySession = new Map<string, Set<string>>();
  for (const te of entries) {
    const ec = ecByPair.get(`${te.eventId}:${te.team.competitionId}`);
    if (!ec) continue;
    for (const { participant: p } of te.team.members) {
      const quizzlyId = p.quizzlyAccess?.quizzlyParticipantId ?? null;
      pairs.push({ ec, participantId: p.id, quizzlyId });
      if (quizzlyId) {
        const set = idsBySession.get(ec.quizzlySessionId!) ?? new Set<string>();
        set.add(quizzlyId);
        idsBySession.set(ec.quizzlySessionId!, set);
      }
    }
  }

  // One call per distinct session, in parallel; a failure only blanks that session.
  const sessions = [...idsBySession.entries()];
  const settled = await Promise.allSettled(sessions.map(([sid, ids]) => quizzlySessionProgress(sid, [...ids])));
  const rowsBySession = new Map<string, QuizzlyProgressRow[] | null>();
  settled.forEach((r, i) => {
    const sid = sessions[i]![0];
    if (r.status === "rejected") console.error(`[quizzly] progress failed for session ${sid}:`, (r.reason as Error)?.message);
    rowsBySession.set(sid, r.status === "fulfilled" ? r.value : null);
  });

  const data: Record<string, Record<string, QuizzlyCell>> = {};
  for (const { ec, participantId, quizzlyId } of pairs) {
    const byEc = (data[ec.id] ??= {});
    if (!quizzlyId) { byEc[participantId] = { state: "no_account" }; continue; }
    const sessionRows = rowsBySession.get(ec.quizzlySessionId!);
    if (!sessionRows) { byEc[participantId] = { state: "unknown" }; continue; }

    // A session can serve several competitions; the competition's quiz map
    // decides which of the participant's quizzes belong to this one.
    const quizIds = new Set(((ec.quizzlyQuizMap as QuizzlyQuizAssignment[] | null) ?? []).map((m) => m.quizId));
    const rows = sessionRows.filter((r) => r.participant.id === quizzlyId && (quizIds.size === 0 || quizIds.has(r.quiz.id)));
    if (rows.length === 0) { byEc[participantId] = { state: "no_token" }; continue; }

    const best = rows.reduce((a, b) => (RANK[b.attempt.progress] > RANK[a.attempt.progress] ? b : a));
    byEc[participantId] = {
      state:          "ok",
      tokensIssued:   rows.reduce((n, r) => n + r.tokens.issued, 0),
      currentStatus:  best.current_token.status,
      progress:       best.attempt.progress,
      answered:       best.attempt.answered,
      totalQuestions: best.attempt.total_questions,
      quizTitle:      best.quiz.title,
    };
  }

  return NextResponse.json({ data, fetchedAt: new Date().toISOString() });
}
