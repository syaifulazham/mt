import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

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
    },
  });
  return NextResponse.json({ data: wic });
}

// DELETE /api/v2/organizer/events/[id]/walkin/[wicId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { wicId } = await params;

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: wicId },
    include: { _count: { select: { registrations: true } } },
  });
  if (!wic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (wic._count.registrations > 0)
    return NextResponse.json({ error: "HAS_REGISTRATIONS", message: "Remove all registrations first." }, { status: 409 });

  await db.eventWalkInCompetition.delete({ where: { id: wicId } });
  return NextResponse.json({ success: true });
}
