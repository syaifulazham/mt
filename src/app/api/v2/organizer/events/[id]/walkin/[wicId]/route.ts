import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];

// PATCH /api/v2/organizer/events/[id]/walkin/[wicId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { wicId } = await params;

  const {
    picName, picContact, maxSlots, publishToPortal,
    useViblockarena, useDronearena, useVibeblocks,
    viblockChallengeId, viblockChallengeLocked, judgingTemplatesLocked,
    vibeBlocksChallengeId, vibeBlocksEventName, vibeBlocksStartsAt, vibeBlocksEndsAt, vibeBlocksRunDurationSec,
    walkInSlotSchedule,
  } = await req.json();

  // Mutual exclusivity: turning one bot on turns the others off
  let viblock    = useViblockarena !== undefined ? Boolean(useViblockarena) : undefined;
  let drone      = useDronearena   !== undefined ? Boolean(useDronearena)   : undefined;
  let vibeblocks = useVibeblocks   !== undefined ? Boolean(useVibeblocks)   : undefined;
  if (viblock    === true) { drone = false; vibeblocks = false; }
  if (drone      === true) { viblock = false; vibeblocks = false; }
  if (vibeblocks === true) { viblock = false; drone = false; }

  const wic = await db.eventWalkInCompetition.update({
    where: { id: wicId },
    data: {
      ...(picName             !== undefined && { picName:            picName?.trim()    || null }),
      ...(picContact          !== undefined && { picContact:         picContact?.trim() || null }),
      ...(maxSlots            !== undefined && { maxSlots:           Number(maxSlots)   || 0 }),
      ...(publishToPortal     !== undefined && { publishToPortal:    Boolean(publishToPortal) }),
      ...(viblock             !== undefined && { useViblockarena:    viblock }),
      ...(drone               !== undefined && { useDronearena:      drone }),
      ...(vibeblocks          !== undefined && { useVibeblocks:      vibeblocks }),
      ...(viblockChallengeId       !== undefined && { viblockChallengeId:       viblockChallengeId || null }),
      ...(viblockChallengeLocked   !== undefined && { viblockChallengeLocked:   Boolean(viblockChallengeLocked) }),
      ...(judgingTemplatesLocked   !== undefined && { judgingTemplatesLocked:   Boolean(judgingTemplatesLocked) }),
      ...(vibeBlocksChallengeId    !== undefined && { vibeBlocksChallengeId:    vibeBlocksChallengeId || null }),
      ...(vibeBlocksEventName      !== undefined && { vibeBlocksEventName:      vibeBlocksEventName || null }),
      ...(vibeBlocksStartsAt       !== undefined && { vibeBlocksStartsAt:       vibeBlocksStartsAt ? new Date(vibeBlocksStartsAt) : null }),
      ...(vibeBlocksEndsAt         !== undefined && { vibeBlocksEndsAt:         vibeBlocksEndsAt ? new Date(vibeBlocksEndsAt) : null }),
      ...(vibeBlocksRunDurationSec !== undefined && { vibeBlocksRunDurationSec: vibeBlocksRunDurationSec !== null ? Number(vibeBlocksRunDurationSec) : null }),
      ...(walkInSlotSchedule !== undefined && { walkInSlotSchedule: walkInSlotSchedule ?? Prisma.JsonNull }),
    },
  });
  return NextResponse.json({ data: wic });
}

// DELETE /api/v2/organizer/events/[id]/walkin/[wicId]
/**
 * DELETE — remove a walk-in competition from the event. Refused while it has
 * registrations, unless a Super Admin passes ?force=1: the database then
 * cascades the registrations, their judging scores and form submissions with it.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id: eventId, wicId } = await params;
  const force = req.nextUrl.searchParams.get("force") === "1";
  if (force && session.role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "FORBIDDEN", message: "Only a Super Admin can remove a walk-in competition with its registrations." }, { status: 403 });

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: wicId },
    include: {
      competition: { select: { code: true, name: true } },
      _count: { select: { registrations: true, formSubmissions: true } },
    },
  });
  if (!wic || wic.eventId !== eventId) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (wic._count.registrations > 0 && !force)
    return NextResponse.json(
      { error: "HAS_REGISTRATIONS", message: "Remove all registrations first.", registrations: wic._count.registrations },
      { status: 409 },
    );

  await db.eventWalkInCompetition.delete({ where: { id: wicId } });
  if (force && wic._count.registrations > 0) {
    console.warn(
      `[walkin] ${session.name || session.email} (SUPER_ADMIN) removed walk-in ${wic.competition.code} ${wic.competition.name} ` +
      `from event ${eventId} with ${wic._count.registrations} registrations and ${wic._count.formSubmissions} form submissions`,
    );
  }
  return NextResponse.json({ success: true, removedRegistrations: wic._count.registrations });
}
