import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { VOTING_WRITE_ROLES } from "@/lib/voting";
import { WEBCRAFT_INTEGRATION } from "@/lib/webcraftJudging";

/**
 * Organizer guard for the voting routes: the signed-in organizer and the event
 * competition, or a response to return. `write` requires SUPER_ADMIN/ADMIN.
 */
export async function votingGuard(eventId: string, ecId: string, write: boolean) {
  const session = await getOrganizerSession();
  if (!session) return { res: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  if (write && !VOTING_WRITE_ROLES.includes(session.role)) return { res: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  const ec = await db.eventCompetition.findFirst({ where: { id: ecId, eventId }, select: { id: true, eventId: true, competitionId: true } });
  if (!ec) return { res: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }) };
  return { session, ec };
}

/** The session, when it belongs to this event competition. */
export function findVotingSession(ecId: string, sid: string) {
  return db.votingSession.findFirst({ where: { id: sid, eventCompetitionId: ecId } });
}

/** Is this event competition's competition integrated with WebCraft? */
export async function isWebcraftCompetition(competitionId: string) {
  const c = await db.competition.findUnique({ where: { id: competitionId }, select: { thirdPartyIntegration: true } });
  return c?.thirdPartyIntegration === WEBCRAFT_INTEGRATION;
}
