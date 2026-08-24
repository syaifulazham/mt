import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { vibeBlocksConfigured, vibeBlocksCreateEvent, vibeBlocksUpdateEvent } from "@/lib/vibeblocks";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// POST /api/v2/organizer/events/[id]/walkin/[wicId]/vibeblocks-event
// Creates a VibeBlocks competition event using the event slug as the stable event_id.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id, wicId } = await params;
  const body = await req.json() as {
    challengeId?: string;
    name?: string;
    startsAt?: string;
    endsAt?: string;
    runDurationSec?: number;
  };
  const { challengeId, name, startsAt, endsAt, runDurationSec } = body;

  if (!challengeId || !name || runDurationSec === undefined) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }
  if (!startsAt || !endsAt) {
    return NextResponse.json({ error: "MISSING_DATES", message: "Start and end dates are required." }, { status: 400 });
  }

  if (!vibeBlocksConfigured())
    return NextResponse.json({ error: "VIBEBLOCKS_NOT_CONFIGURED", message: "VibeBlocks API is not configured." }, { status: 400 });

  // Use the event slug as the stable VibeBlocks event_id (per integration guide)
  const event = await db.event.findUnique({ where: { id }, select: { slug: true } });
  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  const vbEventId = event.slug;

  try {
    const result = await vibeBlocksCreateEvent({
      event_id: vbEventId,
      challenge_id: challengeId,
      name,
      starts_at: startsAt,
      ends_at: endsAt,
      run_duration_sec: runDurationSec,
    });

    await db.eventWalkInCompetition.update({
      where: { id: wicId },
      data: {
        viblockChallengeId:      vbEventId,
        vibeBlocksChallengeId:   challengeId,
        vibeBlocksEventName:     name,
        vibeBlocksStartsAt:      new Date(startsAt),
        vibeBlocksEndsAt:        new Date(endsAt),
        vibeBlocksRunDurationSec: runDurationSec,
      },
    });

    return NextResponse.json({ eventId: vbEventId, alreadyExists: result.already_exists });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; body?: unknown };
    if (err.status === 409) {
      return NextResponse.json(
        { error: "CONFLICT", message: "Event config conflicts with existing VibeBlocks event." },
        { status: 409 },
      );
    }
    console.error("[vibeblocks] createEvent failed:", err.message, "status:", err.status, "body:", err.body);
    return NextResponse.json(
      { error: err.message ?? "VibeBlocks API error", viblockStatus: err.status, detail: err.body },
      { status: err.status ?? 502 },
    );
  }
}

// PATCH /api/v2/organizer/events/[id]/walkin/[wicId]/vibeblocks-event
// Updates the VibeBlocks event config. Returns 400 if event not yet created.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { wicId } = await params;

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: wicId },
    select: { viblockChallengeId: true },
  });

  if (!wic?.viblockChallengeId) {
    return NextResponse.json(
      { error: "NO_EVENT_CREATED", message: "VibeBlocks event has not been created yet." },
      { status: 400 },
    );
  }

  const body = await req.json() as {
    name?: string;
    startsAt?: string;
    endsAt?: string;
    runDurationSec?: number;
    status?: "open" | "closed";
  };
  const { name, startsAt, endsAt, runDurationSec, status } = body;

  const vbPatch: Parameters<typeof vibeBlocksUpdateEvent>[1] = {};
  if (name !== undefined)          vbPatch.name             = name;
  if (startsAt !== undefined)      vbPatch.starts_at        = startsAt;
  if (endsAt !== undefined)        vbPatch.ends_at          = endsAt;
  if (runDurationSec !== undefined) vbPatch.run_duration_sec = runDurationSec;
  if (status !== undefined)        vbPatch.status           = status;

  let result: { updated: boolean };
  try {
    result = await vibeBlocksUpdateEvent(wic.viblockChallengeId, vbPatch);
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; body?: unknown };
    console.error("[vibeblocks] updateEvent failed:", err.message, "status:", err.status, "body:", err.body);
    return NextResponse.json(
      { error: err.message ?? "VibeBlocks API error", viblockStatus: err.status, detail: err.body },
      { status: err.status ?? 502 },
    );
  }

  const dbPatch: Record<string, unknown> = {};
  if (name !== undefined)           dbPatch.vibeBlocksEventName      = name;
  if (startsAt !== undefined)       dbPatch.vibeBlocksStartsAt       = new Date(startsAt);
  if (endsAt !== undefined)         dbPatch.vibeBlocksEndsAt         = new Date(endsAt);
  if (runDurationSec !== undefined) dbPatch.vibeBlocksRunDurationSec = runDurationSec;

  if (Object.keys(dbPatch).length > 0) {
    await db.eventWalkInCompetition.update({
      where: { id: wicId },
      data: dbPatch,
    });
  }

  return NextResponse.json({ updated: result.updated });
}
