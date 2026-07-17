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

// POST — log attendance by contingentId or teamId
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = await req.json().catch(() => ({})) as {
    passcode?: string; contingentId?: string; teamId?: string;
  };

  const result = await resolveEndpoint(code, body.passcode ?? "");
  if ("error" in result)
    return NextResponse.json({ error: result.error }, { status: result.status });

  const { eventId } = result;
  const now = new Date();

  if (body.contingentId) {
    await db.teamEvent.updateMany({
      where: { eventId, team: { contingentId: body.contingentId }, acceptance: "ACCEPT" },
      data: { attendedAt: now },
    });
  } else if (body.teamId) {
    await db.teamEvent.updateMany({
      where: { eventId, teamId: body.teamId, acceptance: "ACCEPT" },
      data: { attendedAt: now },
    });
  } else {
    return NextResponse.json({ error: "MISSING_TARGET" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, attendedAt: now.toISOString() });
}

// DELETE — undo attendance
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = await req.json().catch(() => ({})) as {
    passcode?: string; contingentId?: string; teamId?: string;
  };

  const result = await resolveEndpoint(code, body.passcode ?? "");
  if ("error" in result)
    return NextResponse.json({ error: result.error }, { status: result.status });

  const { eventId } = result;

  if (body.contingentId) {
    await db.teamEvent.updateMany({
      where: { eventId, team: { contingentId: body.contingentId }, acceptance: "ACCEPT" },
      data: { attendedAt: null },
    });
  } else if (body.teamId) {
    await db.teamEvent.updateMany({
      where: { eventId, teamId: body.teamId, acceptance: "ACCEPT" },
      data: { attendedAt: null },
    });
  } else {
    return NextResponse.json({ error: "MISSING_TARGET" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
