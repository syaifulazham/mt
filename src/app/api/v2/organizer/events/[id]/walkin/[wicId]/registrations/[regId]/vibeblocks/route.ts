import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  vibeBlocksConfigured,
  vibeBlocksRegisterEntry,
  vibeBlocksReplaceToken,
  generateEntryToken,
  encodeVibeBlocksToken,
  parseVibeBlocksToken,
} from "@/lib/vibeblocks";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

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
  const { regId } = await params;

  const reg = await db.walkInRegistration.findUnique({
    where: { id: regId },
    include: { walkInCompetition: { select: { viblockChallengeId: true } } },
  });
  if (!reg) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (reg.viblockToken) return NextResponse.json({ error: "ALREADY_REGISTERED" }, { status: 409 });

  const eventId = reg.walkInCompetition?.viblockChallengeId;
  if (!eventId) return NextResponse.json({ error: "VIBEBLOCKS_EVENT_NOT_CONFIGURED" }, { status: 400 });

  try {
    const entryToken = generateEntryToken();
    const result = await vibeBlocksRegisterEntry(eventId, {
      entryToken,
      partnerReference: regId,
    });
    await db.walkInRegistration.update({
      where: { id: regId },
      data: { viblockToken: encodeVibeBlocksToken(entryToken, result.entry_id) },
    });
    return NextResponse.json({ entryToken, entryId: result.entry_id });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json(
      { error: err.message ?? "Registration failed" },
      { status: err.status ?? 502 },
    );
  }
}

// PATCH — replace (reissue) an entry token
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string; regId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!vibeBlocksConfigured()) return NextResponse.json({ error: "VIBEBLOCKS_NOT_CONFIGURED" }, { status: 400 });
  const { regId } = await params;

  // force=true: when the existing entry is consumed, register a fresh entry instead
  const body = await req.json().catch(() => ({})) as { force?: boolean };
  const force = body.force === true;

  const reg = await db.walkInRegistration.findUnique({
    where: { id: regId },
    include: { walkInCompetition: { select: { viblockChallengeId: true } } },
  });
  if (!reg) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!reg.viblockToken) return NextResponse.json({ error: "NO_TOKEN" }, { status: 400 });

  const eventId = reg.walkInCompetition?.viblockChallengeId;
  if (!eventId) return NextResponse.json({ error: "VIBEBLOCKS_EVENT_NOT_CONFIGURED" }, { status: 400 });

  const parsed = parseVibeBlocksToken(reg.viblockToken);
  if (!parsed) return NextResponse.json({ error: "INVALID_TOKEN_FORMAT" }, { status: 422 });

  try {
    const newEntryToken = generateEntryToken();
    let entryId: string;
    try {
      const result = await vibeBlocksReplaceToken(eventId, parsed.entryId, newEntryToken);
      entryId = result.entry_id;
    } catch (replaceErr) {
      const rErr = replaceErr as { status?: number; body?: { error?: { code?: string } } };
      // 409 ENTRY_ALREADY_CONSUMED = participant already used the token. The contract
      // excludes replacing consumed tokens; the sanctioned reissue path is a fresh entry.
      if (rErr.status === 409 && rErr.body?.error?.code === "ENTRY_ALREADY_CONSUMED") {
        if (!force) {
          return NextResponse.json(
            { error: "ENTRY_ALREADY_CONSUMED", message: "Token telah digunakan oleh peserta dan tidak boleh diganti." },
            { status: 409 },
          );
        }
        const result = await vibeBlocksRegisterEntry(eventId, {
          entryToken: newEntryToken,
          partnerReference: regId,
        });
        entryId = result.entry_id;
        await db.walkInRegistration.update({
          where: { id: regId },
          data: { viblockToken: encodeVibeBlocksToken(newEntryToken, entryId) },
        });
        return NextResponse.json({ entryToken: newEntryToken, entryId, newEntry: true });
      }
      // 404 = entry no longer exists in VibeBlocks (e.g. event config changed after
      // registration). Re-register as a fresh entry under the current event.
      if (rErr.status !== 404) throw replaceErr;
      const result = await vibeBlocksRegisterEntry(eventId, {
        entryToken: newEntryToken,
        partnerReference: regId,
      });
      entryId = result.entry_id;
    }
    await db.walkInRegistration.update({
      where: { id: regId },
      data: { viblockToken: encodeVibeBlocksToken(newEntryToken, entryId) },
    });
    return NextResponse.json({ entryToken: newEntryToken, entryId });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json(
      { error: err.message ?? "Token replacement failed" },
      { status: err.status ?? 502 },
    );
  }
}
