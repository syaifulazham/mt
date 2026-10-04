import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { fc1Attempts, fc1Configured, fc1ErrorMessage } from "@/lib/eptim-fc1";
import { challengeLaunchLink } from "@/lib/fc1Participant";
import { loadFc1ChallengeAccess } from "@/lib/fc1ChallengeAccess";

/**
 * POST { eventCompetitionId, challengeId } — the launch link for a registered
 * challenge: the current one while FC-1 still reports it valid, otherwise a new
 * one. Launch codes are single-use and live 5 minutes, so an expired or already
 * used link is simply replaced.
 *
 * Refused once the challenge is completed, or when FC-1 says no attempts are
 * left — there is nothing more to play.
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
  const { participant } = access;

  const [fc1Access, row] = await Promise.all([
    db.participantFc1Access.findUnique({ where: { participantId: participant.id }, select: { fc1UserId: true } }),
    db.participantFc1Challenge.findUnique({
      where: {
        participantId_eventCompetitionId_challengeId: { participantId: participant.id, eventCompetitionId, challengeId },
      },
      select: { id: true, launchCode: true, launchUrl: true, launchExpiresAt: true },
    }),
  ]);
  if (!fc1Access || !row)
    return NextResponse.json({ error: "Daftar cabaran ini dahulu." }, { status: 409 });

  try {
    const attempts = await fc1Attempts(challengeId, fc1Access.fc1UserId);
    if (attempts.completed)
      return NextResponse.json({ error: "Anda telah menyelesaikan cabaran ini." }, { status: 409 });
    if (attempts.attempts_remaining === 0)
      return NextResponse.json({ error: "Cubaan untuk cabaran ini telah habis." }, { status: 409 });

    return NextResponse.json({ link: await challengeLaunchLink(row, fc1Access.fc1UserId, participant.contingentId) });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error(
      `[eptim-fc1] challenge link failed for participant ${participant.id} challenge ${challengeId}:`,
      err.message, "| upstream:", err.detail ?? "—",
    );
    return NextResponse.json({ error: fc1ErrorMessage(err) }, { status: err.status ?? 422 });
  }
}
