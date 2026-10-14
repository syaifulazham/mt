import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";
import { matchingTargetGroups } from "@/lib/targetGroupMatch";

/**
 * POST { eventCompetitionId } — enrol the participant in the Bengkel MT
 * (EptimEdu) course of one INDIVIDUAL competition and return an SSO login URL.
 *
 * Individual competitions (Asia Spark, FC-1, individual Drone) have no team, so
 * the course goes on the participant's own LMS account — username = IC digits,
 * the account the Bengkel page creates. Team competitions keep using the team
 * account through /bengkel/signin { teamId }.
 *
 * The course is resolved here, never taken from the client: the event's own
 * course first, then the competition-level one — the same order the team flow
 * uses. enrol() creates the LMS account when it doesn't exist yet; a new
 * account gets the Bengkel page's initial password convention.
 */
export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!eptimEduConfigured()) return NextResponse.json({ error: "EPTIMEDU_NOT_CONFIGURED" }, { status: 503 });

  const { eventCompetitionId } = await req.json().catch(() => ({})) as { eventCompetitionId?: string };
  if (!eventCompetitionId) return NextResponse.json({ error: "MISSING_EVENT_COMPETITION_ID" }, { status: 400 });

  const participant = await db.participant.findUnique({
    where:  { id: session.participantId },
    select: { name: true, ic: true, eduLevel: true, classGrade: true, ppki: true, age: true },
  });
  if (!participant) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const username = participant.ic?.replace(/\D/g, "") ?? "";
  if (!username)
    return NextResponse.json(
      { error: "Nombor kad pengenalan diperlukan untuk mendaftar kursus. Kemas kini profil anda." },
      { status: 422 },
    );

  const ec = await db.eventCompetition.findUnique({
    where: { id: eventCompetitionId },
    select: {
      eptimEduCourseId: true,
      event: { select: { status: true } },
      competition: {
        select: {
          participationType: true, eptimEduCourseId: true,
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
  if (ec.competition.participationType !== "INDIVIDUAL")
    return NextResponse.json({ error: "NOT_INDIVIDUAL" }, { status: 409 });
  if (!["PUBLISHED", "ACTIVE"].includes(ec.event.status))
    return NextResponse.json({ error: "Acara ini belum dibuka." }, { status: 409 });
  if (matchingTargetGroups(participant, ec.competition.targetGroups.map((t) => t.targetGroup)).length === 0)
    return NextResponse.json({ error: "NOT_ELIGIBLE" }, { status: 403 });

  const courseId = ec.eptimEduCourseId ?? ec.competition.eptimEduCourseId;
  if (!courseId)
    return NextResponse.json({ error: "Tiada kursus ditetapkan untuk pertandingan ini." }, { status: 404 });

  try {
    const exists = await eptimEdu.userExists(username).then((r) => !!r?.exists).catch(() => false);
    await eptimEdu.enrol(username, courseId, {
      force: true, // bypass invite-only courses, as the team flow does
      name:  participant.name.slice(0, 100),
      // Only for a new account: never overwrite a password the student may have changed.
      ...(exists ? {} : { password: participant.name.trim().slice(0, 2).toLowerCase() + username.slice(0, 6) }),
    }).catch((e: { status?: number }) => {
      if (e.status !== 409) throw e; // 409 = already enrolled
    });

    const { loginUrl } = await eptimEdu.createSsoToken(username) as { loginUrl: string };
    return NextResponse.json({ loginUrl, courseId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Ralat Eptim Education";
    console.error(`[bengkel/course] failed for participant ${session.participantId} course ${courseId}:`, msg);
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
