import { db } from "@/lib/db";
import { matchingTargetGroups } from "@/lib/targetGroupMatch";
import {
  quizzlyConfigured, quizzlyErrorMessage, quizzlyGetSession, quizzlyIssueToken, quizzlyResolveSessionQuizSetId,
  quizzlyTokenWindow, quizzlyUpsertParticipant, resolveQuizzlyAssignment, type QuizzlyQuizAssignment,
} from "@/lib/asiaspark-quizzly";

// Organizer-issued Asia Spark quiz links for participants who have no portal
// login of their own (international schools). The participant portal issues
// its own codes in /api/v2/participant/quizzly/token; this is the same token,
// stored in the same ParticipantQuizzlyToken row, so either side sees it.

export type QuizzlyLink = { token: string; startUrl: string | null; quizTitle: string | null; expiresAt: string | null };

type Fail = { error: string; status: number };

/** Quizzly's `personal_id`: the IC for Malaysians, else the passport (upper-case, alphanumerics only). */
function personalIdFor(p: { ic: string | null; passport: string | null }): string {
  const ic = (p.ic ?? "").replace(/\D/g, "");
  if (ic) return ic.slice(0, 64);
  return (p.passport ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 64);
}

/** The event's registration-anchor row of a competition that runs on Asia Spark Quizzly, else null. */
export async function quizzlyEventCompetition(eventId: string, competitionId: string) {
  return db.eventCompetition.findFirst({
    where: {
      eventId, competitionId, parentId: null,
      competition: { thirdPartyIntegration: "asiaspark-quizzly" },
    },
    select: {
      id: true, quizzlySessionId: true, quizzlyAssignBy: true, quizzlyQuizMap: true,
      competition: {
        select: {
          targetGroups: {
            select: { targetGroup: { select: { id: true, name: true, schoolLevel: true, ppki: true, classGrades: true, minAge: true, maxAge: true } } },
          },
        },
      },
    },
  });
}

/**
 * The participant's quiz link for one event competition. Without `regenerate`
 * the stored code is handed back while it hasn't expired; otherwise (or when
 * there is none) a new code is issued in the competition's session, registering
 * the participant with Quizzly first if needed. Quizzly has no API to revoke a
 * code, so a code replaced here stays usable upstream until it expires.
 */
export async function organizerQuizzlyLink(input: {
  eventId: string; competitionId: string; participantId: string; regenerate: boolean;
}): Promise<{ link: QuizzlyLink } | Fail> {
  if (!quizzlyConfigured()) return { error: "Asia Spark Quizzly belum dikonfigurasi.", status: 503 };

  const ec = await quizzlyEventCompetition(input.eventId, input.competitionId);
  if (!ec) return { error: "Pertandingan ini tidak menggunakan Asia Spark Quizzly.", status: 409 };
  if (!ec.quizzlySessionId) return { error: "Sesi Asia Spark belum ditetapkan untuk pertandingan ini (Kuiz Asia Spark).", status: 409 };
  const sessionId = ec.quizzlySessionId;

  const participant = await db.participant.findUnique({
    where: { id: input.participantId },
    select: {
      id: true, name: true, ic: true, passport: true, email: true, age: true, gender: true,
      eduLevel: true, classGrade: true, ppki: true,
      contingent: { select: { name: true, country: { select: { codeIso2: true } } } },
      quizzlyAccess: true,
    },
  });
  if (!participant) return { error: "Peserta tidak ditemui.", status: 404 };

  const toLink = (r: { token: string; startUrl: string | null; quizTitle: string | null; expiresAt: Date | null }): QuizzlyLink =>
    ({ token: r.token, startUrl: r.startUrl, quizTitle: r.quizTitle, expiresAt: r.expiresAt?.toISOString() ?? null });

  const existing = await db.participantQuizzlyToken.findUnique({
    where: { participantId_eventCompetitionId: { participantId: participant.id, eventCompetitionId: ec.id } },
  });
  if (existing && !input.regenerate && (!existing.expiresAt || existing.expiresAt > new Date()))
    return { link: toLink(existing) };

  const matched = matchingTargetGroups(participant, ec.competition.targetGroups.map((t) => t.targetGroup));
  if (matched.length === 0) return { error: "Peserta tidak layak (kumpulan sasaran) untuk pertandingan ini.", status: 403 };
  const assignment = resolveQuizzlyAssignment(
    (ec.quizzlyQuizMap as QuizzlyQuizAssignment[] | null) ?? [], ec.quizzlyAssignBy, matched, participant.classGrade,
  );
  if (!assignment) return { error: "Tiada kuiz ditetapkan untuk tahap / darjah peserta ini.", status: 409 };

  try {
    // One stable personal_id per student: keep the one Quizzly already has.
    let personalId = participant.quizzlyAccess?.personalId ?? personalIdFor(participant);
    if (!personalId) return { error: "No. pasport (atau kad pengenalan) peserta diperlukan untuk Asia Spark Quizzly.", status: 400 };
    if (!participant.quizzlyAccess) {
      const created = await quizzlyUpsertParticipant({
        personalId,
        fullName:    participant.name,
        grade:       participant.classGrade,
        school:      participant.contingent?.name ?? null,
        nationality: participant.contingent?.country?.codeIso2 ?? (participant.ic ? "MY" : null),
        email:       participant.email,
        age:         participant.age,
        gender:      participant.gender === "MALE" ? "male" : participant.gender === "FEMALE" ? "female" : null,
      });
      const access = await db.participantQuizzlyAccess.upsert({
        where:  { participantId: participant.id },
        create: { participantId: participant.id, quizzlyParticipantId: created.id, personalId },
        update: { quizzlyParticipantId: created.id, personalId },
      });
      personalId = access.personalId;
    }

    const [qSession, sessionQuizSetId] = await Promise.all([
      quizzlyGetSession(sessionId),
      assignment.sessionQuizSetId ?? quizzlyResolveSessionQuizSetId(sessionId, assignment.quizId),
    ]);
    if (!qSession) return { error: "Sesi Asia Spark untuk pertandingan ini tidak ditemui.", status: 409 };
    const window = quizzlyTokenWindow(qSession);
    if (window.closed) return { error: "Pusingan kuiz ini telah ditutup.", status: 409 };

    const issued = await quizzlyIssueToken({
      personalId, sessionQuizSetId, expiresInSeconds: window.expiresInSeconds, notBefore: window.notBefore,
    });
    const data = {
      quizId: assignment.quizId, quizTitle: issued.quiz?.title ?? assignment.quizTitle,
      tokenId: issued.token_id, token: issued.token,
      startUrl: issued.start_url, expiresAt: issued.expires_at ? new Date(issued.expires_at) : null,
    };
    const saved = await db.participantQuizzlyToken.upsert({
      where:  { participantId_eventCompetitionId: { participantId: participant.id, eventCompetitionId: ec.id } },
      create: { participantId: participant.id, eventCompetitionId: ec.id, ...data },
      update: data,
    });
    return { link: toLink(saved) };
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error(`[quizzly] organizer link failed for participant ${participant.id}:`, err.message, "| upstream:", err.detail ?? "—");
    return { error: quizzlyErrorMessage(err), status: err.status && err.status >= 400 && err.status < 600 ? err.status : 422 };
  }
}
