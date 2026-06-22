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
 * POST { teamId, eventId? }
 *
 * 1. Verify caller is a member of the team.
 * 2. If eventId is given, look up the EventCompetition row to find the
 *    course for this specific event and enrol the team (best-effort).
 * 3. Generate an SSO login URL for the team's EptimEdu account.
 */
export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!eptimEduConfigured())
    return NextResponse.json({ error: "EPTIMEDU_NOT_CONFIGURED" }, { status: 503 });

  const body = await req.json().catch(() => ({})) as { teamId?: string; eventId?: string };
  const { teamId, eventId } = body;
  if (!teamId) return NextResponse.json({ error: "MISSING_TEAM_ID" }, { status: 400 });

  // Verify membership
  const membership = await db.teamMember.findFirst({
    where: { teamId, participantId: session.participantId },
    include: {
      team: {
        select: {
          id: true,
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

  if (!team.lmsUserId || !team.email) {
    return NextResponse.json(
      { error: "Akaun Bengkel MT pasukan belum didaftarkan. Hubungi pengurus pasukan anda." },
      { status: 400 },
    );
  }

  const username = emailToUsername(team.email);

  // Resolve course to enrol in (event-specific first, fall back to competition-level)
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

  // Enrol team in the resolved course (best-effort — ignore "already enrolled")
  if (courseId) {
    try {
      await eptimEdu.enrol(username, courseId);
    } catch {
      // Non-fatal — proceed to SSO token
    }
  }

  // Generate SSO token
  try {
    const result = await eptimEdu.createSsoToken(username);
    return NextResponse.json({ loginUrl: result.loginUrl });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "EptimEdu API error";
    console.error("[bengkel/signin POST] eptim-edu error:", msg, { username, teamId, eventId });
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
