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
  if (!reg.viblockToken) return NextResponse.json({ error: "NO_TOKEN" }, { status: 400 });

  const eventId = reg.walkInCompetition?.viblockChallengeId;
  if (!eventId) return NextResponse.json({ error: "VIBEBLOCKS_EVENT_NOT_CONFIGURED" }, { status: 400 });

  const parsed = parseVibeBlocksToken(reg.viblockToken);
  if (!parsed) return NextResponse.json({ error: "INVALID_TOKEN_FORMAT" }, { status: 422 });

  try {
    const newEntryToken = generateEntryToken();
    const result = await vibeBlocksReplaceToken(eventId, parsed.entryId, newEntryToken);
    await db.walkInRegistration.update({
      where: { id: regId },
      data: { viblockToken: encodeVibeBlocksToken(newEntryToken, result.entry_id) },
    });
    return NextResponse.json({ entryToken: newEntryToken, entryId: result.entry_id });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json(
      { error: err.message ?? "Token replacement failed" },
      { status: err.status ?? 502 },
    );
  }
}
