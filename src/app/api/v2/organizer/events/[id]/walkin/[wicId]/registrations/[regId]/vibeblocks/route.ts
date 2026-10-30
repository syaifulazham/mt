import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  vibeBlocksConfigured,
  vibeBlocksRegisterFreshEntry,
  vibeBlocksRenewEntry,
  vibeBlocksErrorMessage,
  encodeVibeBlocksToken,
  parseVibeBlocksToken,
  type VibeBlocksError,
} from "@/lib/vibeblocks";

function vbErrorResponse(e: unknown, fallback: string) {
  const err = e as VibeBlocksError;
  console.error(`[vibeblocks] ${fallback}:`, err.message, "status:", err.status, "code:", err.code);
  return NextResponse.json(
    { error: err.code ?? "VIBEBLOCKS_ERROR", message: vibeBlocksErrorMessage(e) || fallback },
    // A 401 from VibeBlocks is our key, not the organizer's session.
    { status: err.status && err.status !== 401 && err.status < 500 ? err.status : 502 },
  );
}

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];

// GET — return parsed token info for this registration
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string; regId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { regId } = await params;

  const reg = await db.walkInRegistration.findUnique({
    where: { id: regId },
    select: { viblockToken: true },
  });
  if (!reg) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!reg.viblockToken) return NextResponse.json({ error: "NO_TOKEN" }, { status: 404 });

  const parsed = parseVibeBlocksToken(reg.viblockToken);
  if (!parsed) return NextResponse.json({ error: "INVALID_TOKEN_FORMAT" }, { status: 422 });

  return NextResponse.json({ entryToken: parsed.entryToken, entryId: parsed.entryId });
}

// POST — register to VibeBlocks for a participant without a token
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string; regId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!vibeBlocksConfigured()) return NextResponse.json({ error: "VIBEBLOCKS_NOT_CONFIGURED" }, { status: 400 });
  const { wicId, regId } = await params;

  const reg = await db.walkInRegistration.findUnique({
    where: { id: regId },
    include: { walkInCompetition: { select: { viblockChallengeId: true } } },
  });
  if (!reg || reg.walkInCompetitionId !== wicId) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (reg.viblockToken) return NextResponse.json({ error: "ALREADY_REGISTERED" }, { status: 409 });

  const eventId = reg.walkInCompetition?.viblockChallengeId;
  if (!eventId) return NextResponse.json({ error: "VIBEBLOCKS_EVENT_NOT_CONFIGURED" }, { status: 400 });

  try {
    const result = await vibeBlocksRegisterFreshEntry(eventId, {
      walkInCompetitionId: reg.walkInCompetitionId,
      partnerReference: regId,
    });
    await db.walkInRegistration.update({
      where: { id: regId },
      data: { viblockToken: encodeVibeBlocksToken(result.entryToken, result.entry_id) },
    });
    return NextResponse.json({ entryToken: result.entryToken, entryId: result.entry_id });
  } catch (e: unknown) {
    return vbErrorResponse(e, "Gagal mendaftar peserta ke VibeBlocks");
  }
}

// PATCH — renew the entry token (contract §6.7). Keeps the same entry_id but
// revokes the old token and clears the entry's device binding, progress and
// results, so the participant starts a fresh attempt.
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string; regId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!vibeBlocksConfigured()) return NextResponse.json({ error: "VIBEBLOCKS_NOT_CONFIGURED" }, { status: 400 });
  const { wicId, regId } = await params;

  const reg = await db.walkInRegistration.findUnique({
    where: { id: regId },
    include: { walkInCompetition: { select: { viblockChallengeId: true } } },
  });
  if (!reg || reg.walkInCompetitionId !== wicId) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!reg.viblockToken) return NextResponse.json({ error: "NO_TOKEN" }, { status: 400 });

  const eventId = reg.walkInCompetition?.viblockChallengeId;
  if (!eventId) return NextResponse.json({ error: "VIBEBLOCKS_EVENT_NOT_CONFIGURED" }, { status: 400 });

  const parsed = parseVibeBlocksToken(reg.viblockToken);
  if (!parsed) return NextResponse.json({ error: "INVALID_TOKEN_FORMAT" }, { status: 422 });

  try {
    let entryToken: string;
    let entryId: string;
    let reregistered = false;
    try {
      const result = await vibeBlocksRenewEntry(eventId, parsed.entryId, { walkInCompetitionId: reg.walkInCompetitionId });
      entryToken = result.entryToken;
      entryId = result.entry_id;
    } catch (renewErr) {
      // 404: the entry is not in the current VibeBlocks event (the competition
      // was pointed at a different event after this token was issued). Register
      // a new entry there; the old mapping refers to an event no longer used.
      if ((renewErr as VibeBlocksError).status !== 404) throw renewErr;
      const result = await vibeBlocksRegisterFreshEntry(eventId, {
        walkInCompetitionId: reg.walkInCompetitionId,
        partnerReference: regId,
      });
      entryToken = result.entryToken;
      entryId = result.entry_id;
      reregistered = true;
    }
    await db.walkInRegistration.update({
      where: { id: regId },
      data: { viblockToken: encodeVibeBlocksToken(entryToken, entryId) },
    });
    return NextResponse.json({ entryToken, entryId, reregistered });
  } catch (e: unknown) {
    return vbErrorResponse(e, "Gagal memperbaharui token");
  }
}
