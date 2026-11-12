import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DUEL_CONFIG_ROLES, duelErr, duelGuard } from "@/lib/duel-server";
import { LINK_SELECT, PASSCODE_RE, genDuelControlPasscode, genDuelControlSlug } from "@/lib/duel-control";

type Params = { params: Promise<{ id: string; ecId: string }> };

// GET — this competition's duel control links (/duel-control/<slug>).
export async function GET(_req: NextRequest, { params }: Params) {
  const { id, ecId } = await params;
  const g = await duelGuard(id, ecId, DUEL_CONFIG_ROLES);
  if ("res" in g) return g.res;
  const links = await db.duelControlEndpoint.findMany({ where: { eventCompetitionId: ecId }, orderBy: { createdAt: "asc" }, select: LINK_SELECT });
  return NextResponse.json({ links });
}

// POST { label?, access?: "CONTROL" | "FULL", passcode? } — a new link; the passcode is generated when not given.
export async function POST(req: NextRequest, { params }: Params) {
  const { id, ecId } = await params;
  const g = await duelGuard(id, ecId, DUEL_CONFIG_ROLES);
  if ("res" in g) return g.res;
  const body = await req.json().catch(() => ({}));
  const passcode = typeof body.passcode === "string" && body.passcode.trim() ? body.passcode.trim().toUpperCase() : genDuelControlPasscode();
  if (!PASSCODE_RE.test(passcode)) return duelErr("INVALID_PASSCODE", "Kod laluan 6–32 huruf atau nombor.");
  const link = await db.duelControlEndpoint.create({
    data: {
      eventCompetitionId: ecId, routeSlug: await genDuelControlSlug(), passcode,
      label: typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 80) : null,
      access: body.access === "FULL" ? "FULL" : "CONTROL",
      createdBy: g.session.name || g.session.email,
    },
    select: LINK_SELECT,
  });
  return NextResponse.json({ link }, { status: 201 });
}
