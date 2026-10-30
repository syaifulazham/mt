import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  vibeBlocksConfigured, vibeBlocksCreateEvent, vibeBlocksUpdateEvent, vibeBlocksGetEvent,
  vibeBlocksErrorMessage, type VibeBlocksError,
  VB_EVENT_ID_RE, VB_RUN_DURATION_MIN, VB_RUN_DURATION_MAX,
} from "@/lib/vibeblocks";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];
/** Closing a VibeBlocks event is irreversible. */
const CLOSE_ROLES = ["SUPER_ADMIN", "ADMIN"];

type Params = { params: Promise<{ id: string; wicId: string }> };

function bad(error: string, message: string, status = 400) {
  return NextResponse.json({ error, message }, { status });
}

function vbErrorResponse(e: unknown, what: string) {
  const err = e as VibeBlocksError;
  console.error(`[vibeblocks] ${what} failed:`, err.message, "status:", err.status, "code:", err.code, "body:", err.body);
  return NextResponse.json(
    { error: err.code ?? "VIBEBLOCKS_ERROR", message: vibeBlocksErrorMessage(e) },
    // A 401 from VibeBlocks is our API key, not the organizer's session.
    { status: err.status && err.status !== 401 && err.status < 500 ? err.status : 502 },
  );
}

const isUtcIso = (s: string) => /Z$/.test(s) && !Number.isNaN(Date.parse(s));

/** Checks a schedule and run duration against the v1.8 contract. */
function checkConfig(c: { startsAt?: string; endsAt?: string; runDurationSec?: number }): string | null {
  if (c.startsAt !== undefined && !isUtcIso(c.startsAt)) return "Masa mula mesti dalam UTC.";
  if (c.endsAt !== undefined && !isUtcIso(c.endsAt)) return "Masa tamat mesti dalam UTC.";
  if (c.startsAt && c.endsAt && Date.parse(c.endsAt) <= Date.parse(c.startsAt))
    return "Masa tamat mesti selepas masa mula.";
  if (c.runDurationSec !== undefined) {
    if (!Number.isInteger(c.runDurationSec) || c.runDurationSec < VB_RUN_DURATION_MIN || c.runDurationSec > VB_RUN_DURATION_MAX)
      return `Tempoh larian mesti antara ${VB_RUN_DURATION_MIN} dan ${VB_RUN_DURATION_MAX} saat.`;
    if (c.startsAt && c.endsAt && c.runDurationSec * 1000 > Date.parse(c.endsAt) - Date.parse(c.startsAt))
      return "Tempoh larian tidak boleh melebihi tempoh acara.";
  }
  return null;
}

async function entryCount(wicId: string) {
  return db.walkInRegistration.count({
    where: { walkInCompetitionId: wicId, viblockToken: { contains: ":ent_" } },
  });
}

async function loadWic(eventId: string, wicId: string) {
  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: wicId },
    select: { eventId: true, viblockChallengeId: true },
  });
  return wic && wic.eventId === eventId ? wic : null;
}

// GET — the event as VibeBlocks currently has it, plus how many entries are
// registered here (the schedule is locked once there is one).
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, wicId } = await params;

  const wic = await loadWic(id, wicId);
  if (!wic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const entries = await entryCount(wicId);
  if (!wic.viblockChallengeId) return NextResponse.json({ event: null, entryCount: entries });
  if (!vibeBlocksConfigured()) return bad("VIBEBLOCKS_NOT_CONFIGURED", "VibeBlocks API tidak dikonfigurasi.");

  try {
    const event = await vibeBlocksGetEvent(wic.viblockChallengeId);
    return NextResponse.json({ event, entryCount: entries });
  } catch (e) {
    return vbErrorResponse(e, "getEvent");
  }
}

// POST — create the VibeBlocks event, using the event slug as its stable event_id.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id, wicId } = await params;
  const body = await req.json() as {
    challengeId?: string;
    name?: string;
    competitionRound?: string;
    startsAt?: string;
    endsAt?: string;
    runDurationSec?: number;
  };
  const { challengeId, competitionRound, startsAt, endsAt, runDurationSec } = body;
  const name = body.name?.trim();

  if (!challengeId || !name || runDurationSec === undefined)
    return bad("MISSING_FIELDS", "Challenge, nama dan tempoh larian diperlukan.");
  if (name.length > 120) return bad("INVALID_NAME", "Nama acara maksimum 120 aksara.");
  if (!startsAt || !endsAt) return bad("MISSING_DATES", "Masa mula dan tamat diperlukan.");
  if (competitionRound !== "qualifier" && competitionRound !== "final")
    return bad("INVALID_ROUND", "competitionRound mesti \"qualifier\" atau \"final\".");
  const invalid = checkConfig({ startsAt, endsAt, runDurationSec });
  if (invalid) return bad("INVALID_CONFIG", invalid);
  if (Date.parse(endsAt) <= Date.now()) return bad("INVALID_CONFIG", "Masa tamat mesti pada masa hadapan.");

  if (!vibeBlocksConfigured()) return bad("VIBEBLOCKS_NOT_CONFIGURED", "VibeBlocks API tidak dikonfigurasi.");

  const [event, wic] = await Promise.all([
    db.event.findUnique({ where: { id }, select: { slug: true } }),
    loadWic(id, wicId),
  ]);
  if (!event || !wic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const vbEventId = event.slug;
  if (!VB_EVENT_ID_RE.test(vbEventId))
    return bad("INVALID_EVENT_ID", "Slug acara tidak boleh digunakan sebagai Event ID VibeBlocks (huruf, nombor, _ atau -, maksimum 64).");

  try {
    const result = await vibeBlocksCreateEvent({
      event_id: vbEventId,
      challenge_id: challengeId,
      name,
      competition_round: competitionRound,
      starts_at: startsAt,
      ends_at: endsAt,
      run_duration_sec: runDurationSec,
    });

    await db.eventWalkInCompetition.update({
      where: { id: wicId },
      data: {
        viblockChallengeId:         vbEventId,
        vibeBlocksChallengeId:      challengeId,
        vibeBlocksEventName:        name,
        vibeBlocksCompetitionRound: competitionRound,
        vibeBlocksStartsAt:         new Date(startsAt),
        vibeBlocksEndsAt:           new Date(endsAt),
        vibeBlocksRunDurationSec:   runDurationSec,
      },
    });

    return NextResponse.json({ eventId: vbEventId, alreadyExists: result.already_exists, event: result });
  } catch (e: unknown) {
    return vbErrorResponse(e, "createEvent");
  }
}

// PATCH — update the event. Only fields that differ from what is stored are
// sent: VibeBlocks locks starts_at/ends_at once an entry is registered, so
// resending an unchanged schedule must not be what fails a rename.
// { status: "closed" } closes the event for good (admins only).
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id, wicId } = await params;
  const wic = await loadWic(id, wicId);
  if (!wic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!wic.viblockChallengeId)
    return bad("NO_EVENT_CREATED", "Acara VibeBlocks belum dicipta.");

  const body = await req.json() as {
    name?: string;
    competitionRound?: "qualifier" | "final";
    startsAt?: string;
    endsAt?: string;
    runDurationSec?: number;
    status?: "closed";
  };
  const { competitionRound, startsAt, endsAt, runDurationSec, status } = body;
  const name = body.name?.trim();

  if (status !== undefined) {
    if (status !== "closed") return bad("INVALID_STATUS", "Hanya status \"closed\" boleh dihantar.");
    if (!CLOSE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (name !== undefined && (!name || name.length > 120)) return bad("INVALID_NAME", "Nama acara 1–120 aksara.");
  if (competitionRound !== undefined && competitionRound !== "qualifier" && competitionRound !== "final")
    return bad("INVALID_ROUND", "competitionRound mesti \"qualifier\" atau \"final\".");

  if (!vibeBlocksConfigured()) return bad("VIBEBLOCKS_NOT_CONFIGURED", "VibeBlocks API tidak dikonfigurasi.");
  // Diff against the live event, which is the source of truth (older linked
  // competitions have no stored schedule).
  let live: Awaited<ReturnType<typeof vibeBlocksGetEvent>>;
  try {
    live = await vibeBlocksGetEvent(wic.viblockChallengeId);
  } catch (e) {
    return vbErrorResponse(e, "getEvent");
  }
  if (!live) return bad("EVENT_NOT_FOUND", "Acara tidak dijumpai di VibeBlocks.", 404);
  if (live.status === "closed") return bad("EVENT_CLOSED", "Acara VibeBlocks telah ditutup dan tidak boleh diubah.", 409);

  const sameTime = (a: string | undefined, b: string) => a === undefined || Date.parse(a) === Date.parse(b);
  const vbPatch: Parameters<typeof vibeBlocksUpdateEvent>[1] = {};
  if (name !== undefined && name !== live.name) vbPatch.name = name;
  if (competitionRound !== undefined && competitionRound !== live.competition_round) vbPatch.competition_round = competitionRound;
  if (!sameTime(startsAt, live.starts_at)) vbPatch.starts_at = startsAt;
  if (!sameTime(endsAt, live.ends_at)) vbPatch.ends_at = endsAt;
  if (runDurationSec !== undefined && runDurationSec !== live.run_duration_sec) vbPatch.run_duration_sec = runDurationSec;
  if (status) vbPatch.status = status;

  // Validate against the schedule the event will have after this patch.
  const invalid = checkConfig({
    startsAt: vbPatch.starts_at ?? live.starts_at,
    endsAt: vbPatch.ends_at ?? live.ends_at,
    runDurationSec: vbPatch.run_duration_sec,
  });
  if (invalid) return bad("INVALID_CONFIG", invalid);

  if ((vbPatch.starts_at || vbPatch.ends_at) && (await entryCount(wicId)) > 0)
    return bad("EVENT_TIMING_LOCKED", "Masa mula/tamat tidak boleh diubah selepas token pertama didaftarkan.", 409);

  let result: { updated: boolean; status?: string } = { updated: false, status: live.status };
  if (Object.keys(vbPatch).length > 0) {
    try {
      result = await vibeBlocksUpdateEvent(wic.viblockChallengeId, vbPatch);
    } catch (e: unknown) {
      return vbErrorResponse(e, "updateEvent");
    }
  }

  // Keep the stored copy in step with VibeBlocks.
  const after = { ...live, ...vbPatch };
  await db.eventWalkInCompetition.update({
    where: { id: wicId },
    data: {
      vibeBlocksEventName:        after.name,
      vibeBlocksCompetitionRound: after.competition_round,
      vibeBlocksStartsAt:         new Date(after.starts_at),
      vibeBlocksEndsAt:           new Date(after.ends_at),
      vibeBlocksRunDurationSec:   after.run_duration_sec,
    },
  });

  return NextResponse.json({ updated: result.updated, status: result.status });
}
