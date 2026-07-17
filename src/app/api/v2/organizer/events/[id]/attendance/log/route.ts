import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * POST /api/v2/organizer/events/[id]/attendance/log
 * Body: { contingentId?, teamId? }
 *
 * Marks contingent (all teams) or a single team as attended.
 *
 * DELETE — same body shape, resets attendedAt to null (undo).
 */

async function resolveResult(eventId: string, contingentId?: string, teamId?: string) {
  if (contingentId) {
    const teamEvents = await db.teamEvent.findMany({
      where: { eventId, team: { contingentId } },
      select: { team: { select: { _count: { select: { members: true } } } } },
    });
    const participants = teamEvents.reduce((s, te) => s + te.team._count.members, 0);
    const contingent = await db.contingent.findUnique({
      where: { id: contingentId },
      select: { name: true, shortName: true, _count: { select: { trainers: true } } },
    });
    return {
      teams:        teamEvents.length,
      participants,
      trainers:     contingent?._count.trainers ?? 0,
      displayName:  contingent?.shortName ?? contingent?.name ?? "",
    };
  }
  if (teamId) {
    const te = await db.teamEvent.findFirst({
      where: { eventId, teamId },
      select: {
        team: {
          select: {
            name: true,
            _count: { select: { members: true } },
            contingent: { select: { _count: { select: { trainers: true } } } },
          },
        },
      },
    });
    return {
      teams:       1,
      participants: te?.team._count.members ?? 0,
      trainers:    te?.team.contingent?._count.trainers ?? 0,
      displayName: te?.team.name ?? "",
    };
  }
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const { contingentId, teamId } = await req.json().catch(() => ({})) as {
    contingentId?: string; teamId?: string;
  };

  if (!contingentId && !teamId)
    return NextResponse.json({ error: "MISSING_TARGET" }, { status: 400 });

  const now = new Date();

  if (contingentId) {
    await db.teamEvent.updateMany({
      where: { eventId, team: { contingentId }, acceptance: "ACCEPT" },
      data:  { attendedAt: now },
    });
  } else if (teamId) {
    await db.teamEvent.updateMany({
      where: { eventId, teamId, acceptance: "ACCEPT" },
      data:  { attendedAt: now },
    });
  }

  const result = await resolveResult(eventId, contingentId, teamId);
  return NextResponse.json({ ...result, attendedAt: now.toISOString() });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const { contingentId, teamId } = await req.json().catch(() => ({})) as {
    contingentId?: string; teamId?: string;
  };

  if (!contingentId && !teamId)
    return NextResponse.json({ error: "MISSING_TARGET" }, { status: 400 });

  if (contingentId) {
    await db.teamEvent.updateMany({
      where: { eventId, team: { contingentId }, acceptance: "ACCEPT" },
      data:  { attendedAt: null },
    });
  } else if (teamId) {
    await db.teamEvent.updateMany({
      where: { eventId, teamId, acceptance: "ACCEPT" },
      data:  { attendedAt: null },
    });
  }

  return NextResponse.json({ ok: true });
}
