import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  vibeBlocksConfigured, vibeBlocksCreateEvent, vibeBlocksUpdateEvent, vibeBlocksGetEvent,
  vibeBlocksListEvents, vibeBlocksErrorMessage, type VibeBlocksError,
} from "@/lib/vibeblocks";
import { GAME_PROVIDERS, asGameProvider, isGameSchoolLevel, type GameProvider } from "@/lib/game-provider";
import { freeEventId, nextEventIdentity } from "@/lib/vibeblocks-recreate";

// The walk-in competition's game-platform event (VibeBlocks or TechTriathlon,
// per `vibeBlocksProvider`; rules in src/lib/game-provider.ts).

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];
/** Closing (irreversible on VibeBlocks), reopening and recreating. */
const CLOSE_ROLES = ["SUPER_ADMIN", "ADMIN"];

type Params = { params: Promise<{ id: string; wicId: string }> };

function bad(error: string, message: string, status = 400) {
  return NextResponse.json({ error, message }, { status });
}

function vbErrorResponse(e: unknown, what: string, p: GameProvider) {
  const err = e as VibeBlocksError;
  console.error(`[${p}] ${what} failed:`, err.message, "status:", err.status, "code:", err.code, "body:", err.body);
  return NextResponse.json(
    { error: err.code ?? "VIBEBLOCKS_ERROR", message: vibeBlocksErrorMessage(e, p) },
    // A 401 from the platform is our API key, not the organizer's session.
    { status: err.status && err.status !== 401 && err.status < 500 ? err.status : 502 },
  );
}

const notConfigured = (p: GameProvider) =>
  bad("VIBEBLOCKS_NOT_CONFIGURED", `${GAME_PROVIDERS[p].label} API tidak dikonfigurasi.`);

const SCHOOL_LEVEL_MSG = "Peringkat sekolah diperlukan: Rendah (primary) atau Menengah (secondary).";

const isUtcIso = (s: string) => /Z$/.test(s) && !Number.isNaN(Date.parse(s));

/** Checks a schedule and run duration against the platform's contract. */
function checkConfig(p: GameProvider, c: { startsAt?: string; endsAt?: string; runDurationSec?: number }): string | null {
  const { runMin, runMax } = GAME_PROVIDERS[p];
  if (c.startsAt !== undefined && !isUtcIso(c.startsAt)) return "Masa mula mesti dalam UTC.";
  if (c.endsAt !== undefined && !isUtcIso(c.endsAt)) return "Masa tamat mesti dalam UTC.";
  if (c.startsAt && c.endsAt && Date.parse(c.endsAt) <= Date.parse(c.startsAt))
    return "Masa tamat mesti selepas masa mula.";
  if (c.runDurationSec !== undefined) {
    if (!Number.isInteger(c.runDurationSec) || c.runDurationSec < runMin || c.runDurationSec > runMax)
      return `Tempoh larian mesti antara ${runMin} dan ${runMax} saat.`;
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
    select: { eventId: true, viblockChallengeId: true, vibeBlocksProvider: true },
  });
  return wic && wic.eventId === eventId ? { ...wic, provider: asGameProvider(wic.vibeBlocksProvider) } : null;
}

/** Event-id base for a platform: TechTriathlon takes lowercase a-z, 0-9, - only. */
function idBase(slug: string, p: GameProvider) {
  return p === "techtriathlon" ? slug.toLowerCase().replace(/[^a-z0-9-]/g, "-") : slug;
}

// GET — the event as the platform currently has it, plus how many entries are
// registered here (VibeBlocks locks the schedule once there is one).
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, wicId } = await params;

  const wic = await loadWic(id, wicId);
  if (!wic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const p = wic.provider;
  const entries = await entryCount(wicId);
  if (!wic.viblockChallengeId) return NextResponse.json({ event: null, entryCount: entries, provider: p });
  if (!vibeBlocksConfigured(p)) return notConfigured(p);

  try {
    const event = await vibeBlocksGetEvent(wic.viblockChallengeId, p);
    return NextResponse.json({ event, entryCount: entries, provider: p });
  } catch (e) {
    return vbErrorResponse(e, "getEvent", p);
  }
}

// POST — create the event, using the event slug as its event_id (or the next
// free <slug><sep><n>). Body `provider` picks the platform; it is fixed once
// the event exists. With { recreate: true }: replace the linked event (see recreate()).
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id, wicId } = await params;
  const body = await req.json() as {
    recreate?: boolean;
    provider?: string;
    challengeId?: string;
    name?: string;
    competitionRound?: string;
    schoolLevel?: string;
    startsAt?: string;
    endsAt?: string;
    runDurationSec?: number;
  };
  if (body.recreate) {
    if (!CLOSE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    return recreate(id, wicId, body);
  }

  const [event, wic] = await Promise.all([
    db.event.findUnique({ where: { id }, select: { slug: true } }),
    loadWic(id, wicId),
  ]);
  if (!event || !wic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  // The platform is chosen with the first event and kept after that.
  const p = wic.viblockChallengeId ? wic.provider : asGameProvider(body.provider);
  const rules = GAME_PROVIDERS[p];

  const { challengeId, competitionRound, schoolLevel, startsAt, endsAt, runDurationSec } = body;
  const name = body.name?.trim();
  if (!challengeId || !name || runDurationSec === undefined)
    return bad("MISSING_FIELDS", "Challenge, nama dan tempoh larian diperlukan.");
  if (name.length > rules.nameMax) return bad("INVALID_NAME", `Nama acara maksimum ${rules.nameMax} aksara.`);
  if (!startsAt || !endsAt) return bad("MISSING_DATES", "Masa mula dan tamat diperlukan.");
  if (competitionRound !== "qualifier" && competitionRound !== "final")
    return bad("INVALID_ROUND", "competitionRound mesti \"qualifier\" atau \"final\".");
  if (rules.schoolLevel && !isGameSchoolLevel(schoolLevel)) return bad("INVALID_SCHOOL_LEVEL", SCHOOL_LEVEL_MSG);
  const invalid = checkConfig(p, { startsAt, endsAt, runDurationSec });
  if (invalid) return bad("INVALID_CONFIG", invalid);
  if (Date.parse(endsAt) <= Date.now()) return bad("INVALID_CONFIG", "Masa tamat mesti pada masa hadapan.");
  if (!vibeBlocksConfigured(p)) return notConfigured(p);
  const level = rules.schoolLevel && isGameSchoolLevel(schoolLevel) ? schoolLevel : null;

  const base = idBase(event.slug, p);
  if (!rules.eventIdRe.test(base))
    return bad("INVALID_EVENT_ID", `Slug acara tidak boleh digunakan sebagai Event ID ${rules.label}.`);

  // The slug when free; otherwise <slug><sep><n>, since the platform refuses an
  // existing event_id with a different configuration.
  let vbEventId: string;
  try {
    const [{ events }, linked] = await Promise.all([
      vibeBlocksListEvents(p),
      db.eventWalkInCompetition.findMany({
        where: { viblockChallengeId: { startsWith: base }, id: { not: wicId } },
        select: { viblockChallengeId: true },
      }),
    ]);
    vbEventId = freeEventId(base, [
      ...events.map(e => e.event_id),
      ...linked.flatMap(w => (w.viblockChallengeId ? [w.viblockChallengeId] : [])),
    ], rules.idSep);
  } catch (e) {
    return vbErrorResponse(e, "listEvents", p);
  }

  try {
    const result = await vibeBlocksCreateEvent({
      event_id: vbEventId,
      challenge_id: challengeId,
      name,
      competition_round: competitionRound,
      ...(level && { school_level: level }),
      starts_at: startsAt,
      ends_at: endsAt,
      run_duration_sec: runDurationSec,
    }, p);

    await db.eventWalkInCompetition.update({
      where: { id: wicId },
      data: {
        viblockChallengeId:         vbEventId,
        vibeBlocksProvider:         p,
        vibeBlocksChallengeId:      challengeId,
        vibeBlocksEventName:        name,
        vibeBlocksCompetitionRound: competitionRound,
        vibeBlocksSchoolLevel:      level,
        vibeBlocksStartsAt:         new Date(startsAt),
        vibeBlocksEndsAt:           new Date(endsAt),
        vibeBlocksRunDurationSec:   runDurationSec,
      },
    });

    return NextResponse.json({ eventId: vbEventId, provider: p, alreadyExists: result.already_exists, event: result });
  } catch (e: unknown) {
    return vbErrorResponse(e, "createEvent", p);
  }
}

// PATCH — update the event. Only fields that differ from what is stored are
// sent: VibeBlocks locks starts_at/ends_at once an entry is registered, so
// resending an unchanged schedule must not be what fails a rename.
// { status: "closed" } closes the event (admins; for good on VibeBlocks).
// { status: "open" } reopens a closed TechTriathlon event (admins).
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id, wicId } = await params;
  const wic = await loadWic(id, wicId);
  if (!wic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const p = wic.provider;
  const rules = GAME_PROVIDERS[p];
  if (!wic.viblockChallengeId)
    return bad("NO_EVENT_CREATED", `Acara ${rules.label} belum dicipta.`);

  const body = await req.json() as {
    name?: string;
    competitionRound?: "qualifier" | "final";
    schoolLevel?: string;
    startsAt?: string;
    endsAt?: string;
    runDurationSec?: number;
    status?: "open" | "closed";
  };
  const { competitionRound, schoolLevel, startsAt, endsAt, runDurationSec, status } = body;
  const name = body.name?.trim();

  if (status !== undefined) {
    if (status !== "closed" && !(status === "open" && rules.canReopen))
      return bad("INVALID_STATUS", rules.canReopen ? "Status mesti \"open\" atau \"closed\"." : "Hanya status \"closed\" boleh dihantar.");
    if (!CLOSE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (name !== undefined && (!name || name.length > rules.nameMax)) return bad("INVALID_NAME", `Nama acara 1–${rules.nameMax} aksara.`);
  if (competitionRound !== undefined && competitionRound !== "qualifier" && competitionRound !== "final")
    return bad("INVALID_ROUND", "competitionRound mesti \"qualifier\" atau \"final\".");
  if (schoolLevel !== undefined && (!rules.schoolLevel || !isGameSchoolLevel(schoolLevel)))
    return bad("INVALID_SCHOOL_LEVEL", SCHOOL_LEVEL_MSG);

  if (!vibeBlocksConfigured(p)) return notConfigured(p);
  // Diff against the live event, which is the source of truth (older linked
  // competitions have no stored schedule).
  let live: Awaited<ReturnType<typeof vibeBlocksGetEvent>>;
  try {
    live = await vibeBlocksGetEvent(wic.viblockChallengeId, p);
  } catch (e) {
    return vbErrorResponse(e, "getEvent", p);
  }
  if (!live) return bad("EVENT_NOT_FOUND", `Acara tidak dijumpai di ${rules.label}.`, 404);
  if (live.status === "closed" && status !== "open")
    return bad("EVENT_CLOSED", rules.canReopen
      ? `Acara ${rules.label} ditutup. Buka semula dahulu untuk mengubahnya.`
      : `Acara ${rules.label} telah ditutup dan tidak boleh diubah.`, 409);

  const sameTime = (a: string | undefined, b: string) => a === undefined || Date.parse(a) === Date.parse(b);
  const vbPatch: Parameters<typeof vibeBlocksUpdateEvent>[1] = {};
  if (name !== undefined && name !== live.name) vbPatch.name = name;
  if (competitionRound !== undefined && competitionRound !== live.competition_round) vbPatch.competition_round = competitionRound;
  if (isGameSchoolLevel(schoolLevel) && schoolLevel !== live.school_level) vbPatch.school_level = schoolLevel;
  if (!sameTime(startsAt, live.starts_at)) vbPatch.starts_at = startsAt;
  if (!sameTime(endsAt, live.ends_at)) vbPatch.ends_at = endsAt;
  if (runDurationSec !== undefined && runDurationSec !== live.run_duration_sec) vbPatch.run_duration_sec = runDurationSec;
  if (status && status !== live.status) vbPatch.status = status;

  // Validate against the schedule the event will have after this patch.
  const invalid = checkConfig(p, {
    startsAt: vbPatch.starts_at ?? live.starts_at,
    endsAt: vbPatch.ends_at ?? live.ends_at,
    runDurationSec: vbPatch.run_duration_sec,
  });
  if (invalid) return bad("INVALID_CONFIG", invalid);

  const entries = (rules.timingLocksAfterEntry && (vbPatch.starts_at || vbPatch.ends_at)) || vbPatch.school_level
    ? await entryCount(wicId) : 0;
  if (rules.timingLocksAfterEntry && (vbPatch.starts_at || vbPatch.ends_at) && entries > 0)
    return bad("EVENT_TIMING_LOCKED", "Masa mula/tamat tidak boleh diubah selepas token pertama didaftarkan.", 409);
  // VibeBlocks locks the school level at the first entry registration.
  if (vbPatch.school_level && entries > 0)
    return bad("EVENT_SCHOOL_LEVEL_LOCKED", "Peringkat sekolah tidak boleh diubah selepas token pertama didaftarkan. Cipta acara baharu untuk peringkat lain.", 409);

  let result: { updated: boolean; status?: string } = { updated: false, status: live.status };
  if (Object.keys(vbPatch).length > 0) {
    try {
      result = await vibeBlocksUpdateEvent(wic.viblockChallengeId, vbPatch, p);
    } catch (e: unknown) {
      return vbErrorResponse(e, "updateEvent", p);
    }
  }

  // Keep the stored copy in step with the platform.
  const after = { ...live, ...vbPatch };
  await db.eventWalkInCompetition.update({
    where: { id: wicId },
    data: {
      vibeBlocksEventName:        after.name,
      vibeBlocksCompetitionRound: after.competition_round,
      vibeBlocksSchoolLevel:      rules.schoolLevel ? after.school_level ?? null : null,
      vibeBlocksStartsAt:         new Date(after.starts_at),
      vibeBlocksEndsAt:           new Date(after.ends_at),
      vibeBlocksRunDurationSec:   after.run_duration_sec,
    },
  });

  return NextResponse.json({ updated: result.updated, status: vbPatch.status ?? result.status ?? live.status });
}

/**
 * Recreate: VibeBlocks never reopens a closed event and freezes the schedule
 * once a token is registered, so a new schedule needs a new event (also
 * available for TechTriathlon). Creates `<slug><sep><n>` named `<name>_<n>`
 * with the given config, points the walk-in at it, then closes the old event if
 * it is still open (its tokens are replaced). The client then runs
 * vibeblocks-sync to give every registration a new token.
 */
async function recreate(
  eventId: string, wicId: string,
  body: { challengeId?: string; competitionRound?: string; schoolLevel?: string; startsAt?: string; endsAt?: string; runDurationSec?: number },
) {
  const { competitionRound, startsAt, endsAt, runDurationSec } = body;
  const [event, wic] = await Promise.all([
    db.event.findUnique({ where: { id: eventId }, select: { slug: true, name: true } }),
    db.eventWalkInCompetition.findUnique({
      where: { id: wicId },
      select: { eventId: true, viblockChallengeId: true, vibeBlocksChallengeId: true, vibeBlocksEventName: true, vibeBlocksProvider: true, vibeBlocksSchoolLevel: true },
    }),
  ]);
  if (!event || !wic || wic.eventId !== eventId) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const p = asGameProvider(wic.vibeBlocksProvider);
  const rules = GAME_PROVIDERS[p];
  if (!wic.viblockChallengeId) return bad("NO_EVENT_CREATED", `Acara ${rules.label} belum dicipta.`);

  if (!startsAt || !endsAt || runDurationSec === undefined) return bad("MISSING_FIELDS", "Masa mula, tamat dan tempoh larian diperlukan.");
  if (competitionRound !== "qualifier" && competitionRound !== "final")
    return bad("INVALID_ROUND", "competitionRound mesti \"qualifier\" atau \"final\".");
  const invalid = checkConfig(p, { startsAt, endsAt, runDurationSec });
  if (invalid) return bad("INVALID_CONFIG", invalid);
  if (Date.parse(endsAt) <= Date.now()) return bad("INVALID_CONFIG", "Masa tamat mesti pada masa hadapan.");
  if (!vibeBlocksConfigured(p)) return notConfigured(p);

  let events: Awaited<ReturnType<typeof vibeBlocksListEvents>>["events"];
  try {
    ({ events } = await vibeBlocksListEvents(p));
  } catch (e) {
    return vbErrorResponse(e, "listEvents", p);
  }
  const old = events.find(e => e.event_id === wic.viblockChallengeId) ?? null;
  // The new event keeps the school level unless another is chosen.
  const levelIn = body.schoolLevel ?? wic.vibeBlocksSchoolLevel ?? old?.school_level ?? undefined;
  if (rules.schoolLevel && !isGameSchoolLevel(levelIn)) return bad("INVALID_SCHOOL_LEVEL", SCHOOL_LEVEL_MSG);
  const level = rules.schoolLevel && isGameSchoolLevel(levelIn) ? levelIn : null;
  const challengeId = body.challengeId || old?.challenge_id || wic.vibeBlocksChallengeId;
  if (!challengeId) return bad("MISSING_FIELDS", "Challenge diperlukan.");
  const next = nextEventIdentity(
    idBase(event.slug, p), old?.name ?? wic.vibeBlocksEventName ?? event.name, events, wic.viblockChallengeId, rules.idSep,
  );
  if (!rules.eventIdRe.test(next.eventId)) return bad("INVALID_EVENT_ID", `Slug acara tidak boleh digunakan sebagai Event ID ${rules.label}.`);
  const name = next.name.slice(0, rules.nameMax);

  try {
    await vibeBlocksCreateEvent({
      event_id: next.eventId, challenge_id: challengeId, name,
      competition_round: competitionRound, ...(level && { school_level: level }),
      starts_at: startsAt, ends_at: endsAt, run_duration_sec: runDurationSec,
    }, p);
  } catch (e) {
    return vbErrorResponse(e, "createEvent (recreate)", p);
  }

  await db.eventWalkInCompetition.update({
    where: { id: wicId },
    data: {
      viblockChallengeId:         next.eventId,
      vibeBlocksChallengeId:      challengeId,
      vibeBlocksEventName:        name,
      vibeBlocksCompetitionRound: competitionRound,
      vibeBlocksSchoolLevel:      level,
      vibeBlocksStartsAt:         new Date(startsAt),
      vibeBlocksEndsAt:           new Date(endsAt),
      vibeBlocksRunDurationSec:   runDurationSec,
    },
  });

  // The old tokens are about to be replaced; stop them being played.
  let oldClosed = old?.status === "closed";
  if (old && !oldClosed) {
    try {
      await vibeBlocksUpdateEvent(old.event_id, { status: "closed" }, p);
      oldClosed = true;
    } catch (e) {
      console.error(`[${p}] closing old event after recreate failed:`, e);
    }
  }
  console.warn(`[${p}] walk-in ${wicId} recreated: ${wic.viblockChallengeId} -> ${next.eventId}`);
  return NextResponse.json({ eventId: next.eventId, name, schoolLevel: level, previousEventId: wic.viblockChallengeId, oldClosed });
}
