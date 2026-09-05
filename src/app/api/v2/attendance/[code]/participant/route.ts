import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

async function resolveEndpoint(code: string, passcode: string) {
  const endpoint = await db.attendanceEndpoint.findUnique({
    where: { routeCode: code },
    select: { passcode: true, active: true, eventId: true },
  });
  if (!endpoint)        return { error: "NOT_FOUND",        status: 404 } as const;
  if (!endpoint.active) return { error: "ENDPOINT_RETIRED", status: 410 } as const;
  if (passcode !== endpoint.passcode)
    return { error: "INVALID_PASSCODE", status: 403 } as const;
  return { eventId: endpoint.eventId };
}

const TEAM_EVENT_SELECT = {
  id:         true,
  attendedAt: true,
  team: {
    select: {
      id:   true,
      name: true,
      competition: { select: { code: true, name: true } },
      members: {
        select: { participant: { select: { id: true, name: true } } },
      },
      contingent: {
        select: {
          name:      true,
          shortName: true,
          state:     { select: { name: true } },
          school:    { select: { state: { select: { name: true } } } },
        },
      },
    },
  },
} as const;

type TeamEventRow = {
  id: string;
  attendedAt: Date | null;
  team: {
    id: string;
    name: string;
    competition: { code: string; name: string };
    members: { participant: { id: string; name: string } }[];
    contingent: {
      name: string;
      shortName: string | null;
      state:  { name: string } | null;
      school: { state: { name: string } | null } | null;
    };
  };
};

function summarise(te: TeamEventRow, participantId: string, attendedAt: Date | null, alreadyAttended: boolean) {
  const c = te.team.contingent;
  return {
    teamEventId:    te.id,
    participantId,
    participantName: te.team.members.find(m => m.participant.id === participantId)?.participant.name ?? null,
    teamName:        te.team.name,
    competitionCode: te.team.competition.code,
    competitionName: `${te.team.competition.code} — ${te.team.competition.name}`,
    contingentName:  c.name,
    contingentShortName: c.shortName,
    state:           c.state?.name ?? c.school?.state?.name ?? null,
    teammates:       te.team.members
                       .filter(m => m.participant.id !== participantId)
                       .map(m => m.participant.name),
    attendedAt:      attendedAt?.toISOString() ?? null,
    alreadyAttended,
  };
}

/**
 * POST /api/v2/attendance/[code]/participant
 * Public — passcode gated.
 * Body: { passcode, participantId, teamEventId? }
 *
 * Records individual participant presence at the competition counter.
 * If the participant belongs to multiple accepted teams in this event and
 * teamEventId is omitted, returns the candidate list instead (409 MULTI_TEAM).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = await req.json().catch(() => ({})) as {
    passcode?: string; participantId?: string; teamEventId?: string;
  };

  const resolved = await resolveEndpoint(code, body.passcode ?? "");
  if ("error" in resolved)
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const participantId = body.participantId?.trim();
  if (!participantId) return NextResponse.json({ error: "MISSING_PARTICIPANT" }, { status: 400 });

  const participant = await db.participant.findUnique({
    where: { id: participantId },
    select: { id: true, name: true },
  });
  if (!participant) return NextResponse.json({ error: "PARTICIPANT_NOT_FOUND" }, { status: 404 });

  const teamEvents = await db.teamEvent.findMany({
    where: {
      eventId: resolved.eventId,
      acceptance: "ACCEPT",
      team: { members: { some: { participantId } } },
    },
    select: TEAM_EVENT_SELECT,
  }) as TeamEventRow[];

  if (teamEvents.length === 0)
    return NextResponse.json({ error: "NO_TEAM" }, { status: 404 });

  let te = teamEvents.find(t => t.id === body.teamEventId);

  if (!te && teamEvents.length === 1) te = teamEvents[0];

  if (!te) {
    return NextResponse.json({
      error: "MULTI_TEAM",
      participantId,
      participantName: participant.name,
      teamEvents: teamEvents.map(t => ({
        teamEventId:     t.id,
        teamName:        t.team.name,
        competitionCode: t.team.competition.code,
        competitionName: `${t.team.competition.code} — ${t.team.competition.name}`,
      })),
    }, { status: 409 });
  }

  const existing = await db.teamEventParticipantAttendance.findUnique({
    where: { teamEventId_participantId: { teamEventId: te.id, participantId } },
  });

  const record = existing
    ? existing
    : await db.teamEventParticipantAttendance.create({
        data: { teamEventId: te.id, participantId },
      });

  return NextResponse.json(summarise(te, participantId, record.attendedAt, !!existing));
}

// DELETE /api/v2/attendance/[code]/participant — undo individual attendance
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = await req.json().catch(() => ({})) as {
    passcode?: string; participantId?: string; teamEventId?: string;
  };

  const resolved = await resolveEndpoint(code, body.passcode ?? "");
  if ("error" in resolved)
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const participantId = body.participantId?.trim();
  if (!participantId || !body.teamEventId)
    return NextResponse.json({ error: "MISSING_TARGET" }, { status: 400 });

  await db.teamEventParticipantAttendance.deleteMany({
    where: {
      participantId,
      teamEventId: body.teamEventId,
      teamEvent: { eventId: resolved.eventId },
    },
  });

  return NextResponse.json({ ok: true });
}
