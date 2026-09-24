import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import {
  csiConfigured, csiErrorMessage, csiListSubscriptions, csiRegisterCompetitionCase,
} from "@/lib/eptim-csi";

type CsiCaseRef = { id: string; slug: string; title: string };

/**
 * Resolve the CSI configuration for one (event, team) pair: the caller must be
 * a member of the team, and the cases come from the event–competition link the
 * organizer configured — never from the request.
 */
async function resolve(participantId: string, teamId: string, eventId: string) {
  const membership = await db.teamMember.findUnique({
    where: { teamId_participantId: { teamId, participantId } },
    include: { team: { select: { id: true, competitionId: true, csiAccess: true } } },
  });
  if (!membership) return { error: NextResponse.json({ error: "NOT_MEMBER" }, { status: 403 }) } as const;

  const ec = await db.eventCompetition.findFirst({
    where: { eventId, competitionId: membership.team.competitionId },
    select: { eptimCsiCompetitionId: true, eptimCsiCompetitionName: true, eptimCsiCases: true },
  });

  return {
    team:  membership.team,
    csiCompetitionId:   ec?.eptimCsiCompetitionId   ?? null,
    csiCompetitionName: ec?.eptimCsiCompetitionName ?? null,
    cases: (ec?.eptimCsiCases as CsiCaseRef[] | null) ?? [],
  };
}

// GET /api/v2/participant/csi/team/cases?teamId=…&eventId=… — cases + registration state
export async function GET(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!csiConfigured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  const teamId  = req.nextUrl.searchParams.get("teamId");
  const eventId = req.nextUrl.searchParams.get("eventId");
  if (!teamId || !eventId) return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });

  const resolved = await resolve(session.participantId, teamId, eventId);
  if ("error" in resolved) return resolved.error;
  const { team, csiCompetitionId, csiCompetitionName, cases } = resolved;

  if (!csiCompetitionId || cases.length === 0)
    return NextResponse.json({ configured: false, accountRegistered: !!team.csiAccess, cases: [] });

  // The case list is only for teams that already hold a CSI player account —
  // withheld here, not merely hidden by the UI.
  if (!team.csiAccess)
    return NextResponse.json({ configured: true, accountRegistered: false, csiCompetitionName, cases: [] });

  const subs = await csiListSubscriptions(team.csiAccess.csiUserId).catch(() => []);
  const registeredIds = new Set(subs.map(s => s.case?.id).filter(Boolean) as string[]);

  return NextResponse.json({
    configured: true,
    accountRegistered: true,
    csiCompetitionName,
    cases: cases.map(c => ({ ...c, registered: registeredIds.has(c.id) })),
  });
}

// POST /api/v2/participant/csi/team/cases — register the team on one case
export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!csiConfigured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  const { teamId, eventId, caseId } = await req.json().catch(() => ({})) as
    { teamId?: string; eventId?: string; caseId?: string };
  if (!teamId || !eventId || !caseId) return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });

  const resolved = await resolve(session.participantId, teamId, eventId);
  if ("error" in resolved) return resolved.error;
  const { team, csiCompetitionId, cases } = resolved;

  if (!csiCompetitionId) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 409 });
  if (!team.csiAccess)
    return NextResponse.json({ error: "Daftar akaun Eptim CSI pasukan terlebih dahulu." }, { status: 409 });
  // Only cases the organizer attached to this event–competition are registrable.
  if (!cases.some(c => c.id === caseId))
    return NextResponse.json({ error: "CASE_NOT_CONFIGURED" }, { status: 409 });

  try {
    const result = await csiRegisterCompetitionCase(csiCompetitionId, team.csiAccess.csiUserId, caseId);
    return NextResponse.json({ ok: true, alreadyRegistered: result.already_registered });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error(
      `[eptim-csi] register case ${caseId} failed for team ${teamId}:`,
      err.message, "| upstream:", err.detail ?? "—",
    );
    return NextResponse.json({ error: csiErrorMessage(err) }, { status: err.status ?? 502 });
  }
}
