import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

const VALID_ACCEPTANCE = ["PENDING", "HOLD", "ACCEPT", "REJECT"] as const;
type Acceptance = (typeof VALID_ACCEPTANCE)[number];

// PATCH — update acceptance status (only for events with needManagerAcceptance=true)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: teamId, eventId } = await params;

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  const team = await db.team.findUnique({ where: { id: teamId }, select: { contingentId: true } });
  if (!team || !contingentIds.includes(team.contingentId))
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { needManagerAcceptance: true, status: true },
  });
  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  if (!event.needManagerAcceptance)
    return NextResponse.json({ error: "ACCEPTANCE_NOT_REQUIRED" }, { status: 400 });
  if (event.status === "DRAFT")
    return NextResponse.json({ error: "EVENT_NOT_PUBLISHED" }, { status: 400 });

  const { acceptance } = await req.json() as { acceptance: Acceptance };
  if (!VALID_ACCEPTANCE.includes(acceptance))
    return NextResponse.json({ error: "INVALID_ACCEPTANCE" }, { status: 400 });

  const updated = await db.teamEvent.update({
    where: { teamId_eventId: { teamId, eventId } },
    data: { acceptance },
    select: { id: true, teamId: true, eventId: true, acceptance: true },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id, eventId } = await params;

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  const team = await db.team.findUnique({ where: { id }, select: { contingentId: true } });
  if (!team || !contingentIds.includes(team.contingentId))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  await db.teamEvent.deleteMany({ where: { teamId: id, eventId } });
  return NextResponse.json({ success: true });
}
