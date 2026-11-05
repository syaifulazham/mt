import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { DUEL_CONFIG_ROLES, genDuelSlug } from "@/lib/duel-server";
import { PASSCODE_RE } from "@/lib/media-endpoint";

type Params = { params: Promise<{ id: string }> };

// Public duel display links: SCHEDULE (jadual) or LIVE (duel semasa).
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const endpoints = await db.duelDisplayEndpoint.findMany({ where: { eventId: id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ endpoints });
}

// POST { label?, kind, competitionIds?, passcode? }
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!DUEL_CONFIG_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const kind = body.kind === "LIVE" ? "LIVE" : "SCHEDULE";
  const passcode = typeof body.passcode === "string" && body.passcode.trim() ? body.passcode.trim().toUpperCase() : null;
  if (passcode && !PASSCODE_RE.test(passcode))
    return NextResponse.json({ error: "BAD_PASSCODE", message: "Passcode 6–32 huruf/nombor." }, { status: 400 });
  const ids: string[] = Array.isArray(body.competitionIds) ? body.competitionIds.map(String) : [];
  const valid = ids.length
    ? (await db.eventCompetition.findMany({ where: { eventId: id, id: { in: ids } }, select: { id: true } })).map(e => e.id)
    : [];
  const endpoint = await db.duelDisplayEndpoint.create({
    data: {
      eventId: id, kind, passcode, competitionIds: valid, routeSlug: await genDuelSlug(),
      label: typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 80) : null,
    },
  });
  return NextResponse.json({ endpoint }, { status: 201 });
}
