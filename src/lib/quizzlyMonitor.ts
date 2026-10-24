import { db } from "@/lib/db";
import { matchingTargetGroups } from "@/lib/targetGroupMatch";
import {
  quizzlySessionProgress, resolveQuizzlyAssignment, quizzlyQuizAttempts,
  type QuizzlyAttempt, type QuizzlyAttemptProgress, type QuizzlyProgressRow, type QuizzlyQuizAssignment,
} from "@/lib/asiaspark-quizzly";

// Organizer monitoring of an event's Asia Spark Quizzly competitions
// ("Pantauan Pertandingan Dalam Talian → Asia Spark Quizzes").
//
// The list is MT's registered participants — everyone entered in the
// competition — each assigned their quiz by the same rule the participant
// portal uses (resolveQuizzlyAssignment). Results are attached from Quizzly,
// one quiz at a time so a page load stays small:
//   - progress for that quiz's participants (status, answered / total, attempt id)
//   - the quiz's submitted attempts in the session (scores), joined on attempt id
// Registered participants Quizzly has no record for show as "no code".

export type QuizzlyMonitorStatus = QuizzlyAttemptProgress | "no_code";

export type QuizzlyMonitorRow = {
  participantId: string;
  name: string;
  contingentName: string;
  stateName: string | null;
  classGrade: string | null;
  status: QuizzlyMonitorStatus;
  answered: number;
  totalQuestions: number;
  submittedAt: string | null;
  durationMs: number | null;
  score: { raw: number; max: number; percentage: number } | null;
};

export type QuizzlyMonitorQuiz = { id: string; title: string; label: string; registered: number };

export type QuizzlyMonitorCompetition = {
  ecId: string;
  code: string;
  name: string;
  sessionTitle: string | null;
  registered: number;
  quizzes: QuizzlyMonitorQuiz[];
  /** Registered participants no quiz could be assigned to. */
  unassigned: number;
};

const TG_SELECT = { id: true, name: true, schoolLevel: true, ppki: true, classGrades: true, minAge: true, maxAge: true } as const;

async function loadEc(eventId: string, ecId?: string) {
  return db.eventCompetition.findMany({
    where:   { eventId, quizzlySessionId: { not: null }, ...(ecId ? { id: ecId } : {}) },
    select:  {
      id: true, competitionId: true, quizzlySessionId: true, quizzlySessionTitle: true,
      quizzlyAssignBy: true, quizzlyQuizMap: true,
      competition: { select: { code: true, name: true, targetGroups: { select: { targetGroup: { select: TG_SELECT } } } } },
    },
    orderBy: { competition: { code: "asc" } },
  });
}
type Ec = Awaited<ReturnType<typeof loadEc>>[number];

/** Registered participants of one event-competition, each with their assigned quiz. */
async function registeredWithQuiz(eventId: string, ec: Ec) {
  const members = await db.teamMember.findMany({
    where:  { team: { competitionId: ec.competitionId, teamEvents: { some: { eventId } } } },
    select: {
      participant: {
        select: {
          id: true, name: true, eduLevel: true, classGrade: true, ppki: true, age: true,
          quizzlyAccess: { select: { quizzlyParticipantId: true } },
          contingent: {
            select: {
              name: true,
              state: { select: { name: true } },
              school: { select: { state: { select: { name: true } } } },
              higherInstitution: { select: { state: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  const map = (ec.quizzlyQuizMap as QuizzlyQuizAssignment[] | null) ?? [];
  const groups = ec.competition.targetGroups.map(t => t.targetGroup);
  const seen = new Set<string>();
  return members.flatMap(({ participant: p }) => {
    if (seen.has(p.id)) return [];
    seen.add(p.id);
    const quiz = resolveQuizzlyAssignment(map, ec.quizzlyAssignBy, matchingTargetGroups(p, groups), p.classGrade);
    return [{ p, quizId: quiz?.quizId ?? null }];
  });
}

/** The event's Quizzly competitions with their quizzes and registered counts (no Quizzly call). */
export async function quizzlyMonitorOverview(eventId: string): Promise<QuizzlyMonitorCompetition[]> {
  const ecs = await loadEc(eventId);
  return Promise.all(ecs.map(async (ec) => {
    const regs = await registeredWithQuiz(eventId, ec);
    const map = (ec.quizzlyQuizMap as QuizzlyQuizAssignment[] | null) ?? [];
    const quizzes = new Map<string, QuizzlyMonitorQuiz>();
    for (const m of map) {
      const q = quizzes.get(m.quizId) ?? { id: m.quizId, title: m.quizTitle, label: "", registered: 0 };
      const tag = m.grade ?? m.targetGroupName;
      q.label = q.label ? `${q.label}, ${tag}` : tag;
      quizzes.set(m.quizId, q);
    }
    for (const r of regs) if (r.quizId && quizzes.has(r.quizId)) quizzes.get(r.quizId)!.registered++;
    return {
      ecId: ec.id, code: ec.competition.code, name: ec.competition.name, sessionTitle: ec.quizzlySessionTitle,
      registered: regs.length,
      quizzes: [...quizzes.values()],
      unassigned: regs.filter(r => !r.quizId).length,
    };
  }));
}

/** One quiz of one event-competition: its registered participants with progress and score. */
export async function quizzlyMonitorQuiz(eventId: string, ecId: string, quizId: string): Promise<QuizzlyMonitorRow[] | null> {
  const [ec] = await loadEc(eventId, ecId);
  if (!ec) return null;
  const regs = (await registeredWithQuiz(eventId, ec)).filter(r => r.quizId === quizId);
  const sessionId = ec.quizzlySessionId!;

  const qzIds = regs.map(r => r.p.quizzlyAccess?.quizzlyParticipantId).filter((x): x is string => !!x);
  const [progress, attempts] = await Promise.all([
    quizzlySessionProgress(sessionId, qzIds, quizId),
    quizzlyQuizAttempts(sessionId, quizId),
  ]);
  const progressBy = new Map<string, QuizzlyProgressRow>(progress.map(r => [r.participant.id, r]));
  const attemptById = new Map<string, QuizzlyAttempt>(attempts.map(a => [a.session_id, a]));
  // Fallback when progress points at no attempt: the participant's best submitted one
  const bestBy = new Map<string, QuizzlyAttempt>();
  for (const a of attempts) {
    const cur = bestBy.get(a.participant_id);
    if (a.score && (!cur?.score || a.score.percentage > cur.score.percentage)) bestBy.set(a.participant_id, a);
  }

  return regs.map(({ p }) => {
    const c = p.contingent;
    const qzId = p.quizzlyAccess?.quizzlyParticipantId;
    const pr = qzId ? progressBy.get(qzId) : undefined;
    const attempt = (pr?.attempt.session_id ? attemptById.get(pr.attempt.session_id) : undefined) ?? (qzId ? bestBy.get(qzId) : undefined);
    const status: QuizzlyMonitorStatus = attempt?.score ? "submitted" : (pr?.attempt.progress ?? "no_code");
    return {
      participantId: p.id,
      name: p.name,
      contingentName: c?.name ?? "—",
      stateName: c?.state?.name ?? c?.school?.state?.name ?? c?.higherInstitution?.state?.name ?? null,
      classGrade: p.classGrade,
      status,
      answered: pr?.attempt.answered ?? 0,
      totalQuestions: pr?.attempt.total_questions ?? 0,
      submittedAt: attempt?.timing.submitted_at ?? pr?.attempt.submitted_at ?? null,
      durationMs: attempt?.timing.duration_ms ?? null,
      score: attempt?.score ? { raw: attempt.score.raw, max: attempt.score.max, percentage: attempt.score.percentage } : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Does the event have a competition linked to Asia Spark Quizzly? (manage-page card) */
export async function eventHasQuizzly(eventSlug: string): Promise<boolean> {
  const n = await db.eventCompetition.count({
    where: { event: { slug: eventSlug }, quizzlySessionId: { not: null } },
  });
  return n > 0;
}
