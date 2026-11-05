import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { vibeBlocksConfigured, vibeBlocksErrorMessage } from "@/lib/vibeblocks";
import { registrationsToSync, syncVibeBlocksEntries } from "@/lib/vibeblocks-recreate";
import { asGameProvider } from "@/lib/game-provider";

export const maxDuration = 120;
const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];

type Params = { params: Promise<{ id: string; wicId: string }> };

async function load(eventId: string, wicId: string) {
  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: wicId }, select: { eventId: true, viblockChallengeId: true, useVibeblocks: true, vibeBlocksProvider: true },
  });
  return wic && wic.eventId === eventId && wic.useVibeblocks && wic.viblockChallengeId
    ? { vbEventId: wic.viblockChallengeId, gp: asGameProvider(wic.vibeBlocksProvider) }
    : null;
}

// GET — how many registrations hold no token in the current VibeBlocks event.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, wicId } = await params;
  const w = await load(id, wicId);
  if (!w) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const { vbEventId, gp } = w;
  if (!vibeBlocksConfigured(gp)) return NextResponse.json({ error: "VIBEBLOCKS_NOT_CONFIGURED" }, { status: 400 });
  try {
    const { total, pending } = await registrationsToSync(wicId, vbEventId, gp);
    return NextResponse.json({ total, outOfSync: pending.length });
  } catch (e) {
    return NextResponse.json({ error: "VIBEBLOCKS_ERROR", message: vibeBlocksErrorMessage(e, gp) }, { status: 502 });
  }
}

// POST — give up to 40 out-of-date registrations a token in the current event.
// The client repeats it while `remaining > 0`.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id, wicId } = await params;
  const w = await load(id, wicId);
  if (!w) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const { vbEventId, gp } = w;
  if (!vibeBlocksConfigured(gp)) return NextResponse.json({ error: "VIBEBLOCKS_NOT_CONFIGURED" }, { status: 400 });
  try {
    return NextResponse.json(await syncVibeBlocksEntries(wicId, vbEventId, gp));
  } catch (e) {
    return NextResponse.json({ error: "VIBEBLOCKS_ERROR", message: vibeBlocksErrorMessage(e, gp) }, { status: 502 });
  }
}
