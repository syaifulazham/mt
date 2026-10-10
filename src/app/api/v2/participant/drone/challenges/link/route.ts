import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { droneArena } from "@/lib/eptim-drone";
import { droneChallengeLaunchLink, loadDroneChallengeAccess } from "@/lib/droneTeam";

/**
 * POST { teamId, eventCompetitionId, challengeId } — the launch link for a
 * challenge the team registered for: the current one while Drone still reports
 * it valid, otherwise a new one. Refused once the challenge is completed or no
 * attempts are left. Team counterpart of participant/fc1/challenges/link.
 */
export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!droneArena.configured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  const { teamId, eventCompetitionId, challengeId } =
    await req.json().catch(() => ({})) as { teamId?: string; eventCompetitionId?: string; challengeId?: string };
  if (!teamId || !eventCompetitionId || !challengeId)
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const access = await loadDroneChallengeAccess(session.participantId, teamId, eventCompetitionId, challengeId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const [droneAccess, row] = await Promise.all([
    db.teamDroneAccess.findUnique({ where: { teamId }, select: { droneUserId: true } }),
    db.teamDroneChallenge.findUnique({
      where:  { teamId_eventCompetitionId_challengeId: { teamId, eventCompetitionId, challengeId } },
      select: { id: true, launchCode: true, launchUrl: true },
    }),
  ]);
  if (!droneAccess || !row)
    return NextResponse.json({ error: "Daftar cabaran ini dahulu." }, { status: 409 });

  try {
    const attempts = await droneArena.attempts(challengeId, droneAccess.droneUserId);
    if (attempts.completed)
      return NextResponse.json({ error: "Pasukan anda telah menyelesaikan cabaran ini." }, { status: 409 });
    if (attempts.attempts_remaining === 0)
      return NextResponse.json({ error: "Cubaan untuk cabaran ini telah habis." }, { status: 409 });

    return NextResponse.json({
      link: await droneChallengeLaunchLink(row, droneAccess.droneUserId, access.team.contingentId),
    });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error(`[eptimdrone] challenge link failed for team ${teamId} challenge ${challengeId}:`, err.message, "| upstream:", err.detail ?? "—");
    return NextResponse.json({ error: droneArena.errorMessage(err) }, { status: err.status ?? 422 });
  }
}
