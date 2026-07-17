import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";

function emailToUsername(email: string): string {
  return email
    .toLowerCase()
    .replace(/@/g, "_at_")
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40)
    .padEnd(3, "x");
}

/**
 * POST { teamId?, eventId? }
 *
 * Individual mode (no teamId): generate an SSO token for the participant
 * using their IC number as the LMS username.
 *
 * Team mode (teamId provided — legacy): verify team membership, optionally
 * enrol the team account in a course, then return an SSO login URL.
 */
export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!eptimEduConfigured())
    return NextResponse.json({ error: "EPTIMEDU_NOT_CONFIGURED" }, { status: 503 });

  const body = await req.json().catch(() => ({})) as { teamId?: string; eventId?: string };
  const { teamId, eventId } = body;

  // ── Individual mode ────────────────────────────────────────────────────────
  if (!teamId) {
    const participant = await db.participant.findUnique({
      where: { id: session.participantId },
      select: { ic: true },
    });
    if (!participant) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const icDigits = participant.ic?.replace(/\D/g, "") ?? "";
    if (!icDigits) return NextResponse.json({ error: "NO_IC" }, { status: 400 });

    try {
      const result = await eptimEdu.createSsoToken(icDigits);
      return NextResponse.json({ loginUrl: result.loginUrl });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "EptimEdu API error";
      return NextResponse.json({ error: msg }, { status: 422 });
    }
  }

  // ── Team mode (legacy) ─────────────────────────────────────────────────────

  // Verify membership and load team credentials
  const membership = await db.teamMember.findFirst({
    where: { teamId, participantId: session.participantId },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          email: true,
          lmsUserId: true,
          competitionId: true,
          competition: { select: { eptimEduCourseId: true } },
        },
      },
    },
  });
  if (!membership) return NextResponse.json({ error: "NOT_A_MEMBER" }, { status: 403 });

  const team = membership.team;

  if (!team.email) {
    return NextResponse.json(
      { error: "Pasukan tidak mempunyai alamat emel. Hubungi pengurus pasukan anda." },
      { status: 400 },
    );
  }

  const username = emailToUsername(team.email);

  // Resolve courseId: event-specific first, then competition-level fallback
  let courseId: string | null = null;
  if (eventId) {
    const ec = await db.eventCompetition.findUnique({
      where: { eventId_competitionId: { eventId, competitionId: team.competitionId } },
      select: { eptimEduCourseId: true },
    });
    courseId = ec?.eptimEduCourseId ?? team.competition.eptimEduCourseId ?? null;
  } else {
    courseId = team.competition.eptimEduCourseId ?? null;
  }

  if (!courseId && !team.lmsUserId) {
    return NextResponse.json(
      { error: "Tiada kursus ditetapkan untuk acara ini. Hubungi pengurus anda." },
      { status: 400 },
    );
  }

  // Enrol team in the course (force=true bypasses invite-only restrictions).
  // enrol() also auto-provisions the LMS account if it doesn't exist yet.
  if (courseId) {
    try {
      const enrolResult = await eptimEdu.enrol(username, courseId, { force: true, name: team.name });
      // If this was the first enrolment, persist the new lmsUserId
      if (enrolResult?.userId && !team.lmsUserId) {
        db.team.update({
          where: { id: team.id },
          data: { lmsUserId: enrolResult.userId, lmsCourseEnrolled: true },
        }).catch(() => {});
      }
    } catch (e: unknown) {
      const httpStatus = (e as { status?: number }).status;
      if (httpStatus === 409) {
        // Already enrolled — fine, continue to SSO
      } else {
        console.error("[bengkel/signin POST] enrol error:", e instanceof Error ? e.message : e, { username, courseId });
        // If the account has never been provisioned, SSO will also fail — surface the error
        if (!team.lmsUserId) {
          const msg = e instanceof Error ? e.message : "Gagal mendaftar kursus. Cuba lagi atau hubungi pentadbir.";
          return NextResponse.json({ error: msg }, { status: 422 });
        }
      }
    }
  }

  // Generate SSO token
  try {
    const result = await eptimEdu.createSsoToken(username);
    return NextResponse.json({ loginUrl: result.loginUrl, enrolled: !!courseId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "EptimEdu API error";
    console.error("[bengkel/signin POST] sso error:", msg, { username, teamId, eventId });
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
