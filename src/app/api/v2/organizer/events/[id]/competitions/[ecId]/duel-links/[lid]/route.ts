import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DUEL_CONFIG_ROLES, duelErr, duelGuard } from "@/lib/duel-server";
import { LINK_SELECT, PASSCODE_RE } from "@/lib/duel-control";

type Params = { params: Promise<{ id: string; ecId: string; lid: string }> };

const own = (ecId: string, lid: string) => db.duelControlEndpoint.findFirst({ where: { id: lid, eventCompetitionId: ecId }, select: { id: true } });

// PATCH { label?, access?, active?, passcode? }
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, ecId, lid } = await params;
  const g = await duelGuard(id, ecId, DUEL_CONFIG_ROLES);
  if ("res" in g) return g.res;
  if (!(await own(ecId, lid))) return duelErr("NOT_FOUND", "Pautan tidak dijumpai.", 404);
  const body = await req.json().catch(() => ({}));
  const data: { label?: string | null; access?: string; active?: boolean; passcode?: string } = {};
  if (body.label !== undefined) data.label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 80) : null;
  if (body.access !== undefined) data.access = body.access === "FULL" ? "FULL" : "CONTROL";
  if (body.active !== undefined) data.active = !!body.active;
  if (body.passcode !== undefined) {
    const p = String(body.passcode).trim().toUpperCase();
    if (!PASSCODE_RE.test(p)) return duelErr("INVALID_PASSCODE", "Kod laluan 6–32 huruf atau nombor.");
    data.passcode = p;
  }
  const link = await db.duelControlEndpoint.update({ where: { id: lid }, data, select: LINK_SELECT });
  return NextResponse.json({ link });
}

// DELETE — remove the link; its URL stops working.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, ecId, lid } = await params;
  const g = await duelGuard(id, ecId, DUEL_CONFIG_ROLES);
  if ("res" in g) return g.res;
  if (!(await own(ecId, lid))) return duelErr("NOT_FOUND", "Pautan tidak dijumpai.", 404);
  await db.duelControlEndpoint.delete({ where: { id: lid } });
  return NextResponse.json({ ok: true });
}
