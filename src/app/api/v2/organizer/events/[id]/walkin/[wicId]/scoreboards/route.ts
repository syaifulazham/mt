import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { genScoreboardPasscode, genScoreboardSlug, SCOREBOARD_PASSCODE_RE } from "@/lib/vb-scoreboard";
import { asGameProvider } from "@/lib/game-provider";

// Live scoreboard links (/live/<slug>) of a VibeBlocks walk-in competition.
const SCOREBOARD_ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];
type Params = { params: Promise<{ id: string; wicId: string }> };

const SELECT = { id: true, routeSlug: true, passcode: true, label: true, active: true, createdAt: true } as const;

async function loadWic(eventId: string, wicId: string) {
  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: wicId }, select: { eventId: true, useVibeblocks: true, vibeBlocksProvider: true },
  });
  return wic && wic.eventId === eventId ? wic : null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, wicId } = await params;
  if (!(await loadWic(id, wicId))) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const data = await db.walkInScoreboardEndpoint.findMany({ where: { walkInCompetitionId: wicId }, select: SELECT, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ data });
}

/** POST { label?, passcode? } — passcode "" for an open link; omitted → a generated one. */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!SCOREBOARD_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id, wicId } = await params;
  const wic = await loadWic(id, wicId);
  if (!wic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!wic.useVibeblocks || asGameProvider(wic.vibeBlocksProvider) !== "vibeblocks")
    return NextResponse.json({ error: "NOT_VIBEBLOCKS", message: "Papan skor langsung hanya untuk pertandingan VibeBlocks." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { label?: unknown; passcode?: unknown };
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 80) : null;
  let passcode: string | null;
  if (body.passcode === undefined) passcode = genScoreboardPasscode();
  else if (typeof body.passcode === "string" && !body.passcode.trim()) passcode = null;
  else if (typeof body.passcode === "string" && SCOREBOARD_PASSCODE_RE.test(body.passcode.trim())) passcode = body.passcode.trim().toUpperCase();
  else return NextResponse.json({ error: "INVALID_PASSCODE", message: "Passcode mesti 4–32 huruf atau nombor." }, { status: 400 });

  const created = await db.walkInScoreboardEndpoint.create({
    data: { walkInCompetitionId: wicId, routeSlug: await genScoreboardSlug(), passcode, label },
    select: SELECT,
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
