import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { droneArena } from "@/lib/eptim-drone";
import {
  droneChallengeLaunchLink, droneExternalRef, ensureDroneTeamAccount, loadDroneChallengeAccess,
} from "@/lib/droneTeam";

/**
 * POST { teamId, eventCompetitionId, challengeId } — register the team for one
 * Eptim Drone challenge and hand back a launch link, in one click. The team's
 * Drone player is created on first use.
 *
 * Same flow as FC-1 (participant/fc1/challenges), but for a team: Drone players
 * are team accounts, and the team is already entered in the event by its
 * manager, so no competition entry is created here.
 *
 * Order: Drone first, then the local write. Drone's register is idempotent (409
 * returns the existing registration), so a failure after Drone accepted is
 * healed by a retry, while the reverse order could leave registrations Drone
 * never heard of.
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
  const { ec, challenge } = access;

  let userid: string;
  let contingentId: string;
  try {
    ({ userid, contingentId } = await ensureDroneTeamAccount(teamId));
    await droneArena.withSectorRepair(userid, contingentId, () => droneArena.registerChallenge({
      challengeId, userid, externalRef: droneExternalRef(ec.id, teamId),
    }));
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error(
      `[eptimdrone] registerChallenge failed for team ${teamId} challenge ${challengeId}:`,
      err.message, "| upstream:", err.detail ?? "—",
    );
    if (err.status === 404)
      return NextResponse.json(
        { error: "Akaun pasukan atau cabaran tidak ditemui di Eptim Drone. Cuba lagi, atau hubungi penganjur." },
        { status: 404 },
      );
    return NextResponse.json({ error: droneArena.errorMessage(err) }, { status: err.status ?? 422 });
  }

  const now = new Date();
  const row = await db.teamDroneChallenge.upsert({
    where:  { teamId_eventCompetitionId_challengeId: { teamId, eventCompetitionId: ec.id, challengeId } },
    create: { teamId, eventCompetitionId: ec.id, challengeId, challengeName: challenge.name, droneSyncedAt: now },
    update: { challengeName: challenge.name, droneSyncedAt: now },
  });

  // The registration stands even if the link can't be issued right now; the
  // dashboard offers "Mohon pautan baharu".
  const link = await droneChallengeLaunchLink(row, userid, contingentId).catch((e: unknown) => {
    console.error(`[eptimdrone] launch link after register failed for team ${teamId}:`, (e as Error).message);
    return null;
  });

  return NextResponse.json({ ok: true, challengeId, link });
}
