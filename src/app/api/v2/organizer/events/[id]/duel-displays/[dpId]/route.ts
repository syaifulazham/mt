import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { DUEL_CONFIG_ROLES } from "@/lib/duel-server";
import { PASSCODE_RE } from "@/lib/media-endpoint";

type Params = { params: Promise<{ id: string; dpId: string }> };

async function guard({ params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return { res: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  if (!DUEL_CONFIG_ROLES.includes(session.role)) return { res: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  const { id, dpId } = await params;
  const ep = await db.duelDisplayEndpoint.findFirst({ where: { id: dpId, eventId: id }, select: { id: true } });
  if (!ep) return { res: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }) };
  return { id: dpId };
}

// PATCH { label?, status?, passcode? (null/"" clears) }
export async function PATCH(req: NextRequest, ctx: Params) {
  const g = await guard(ctx);
  if ("res" in g) return g.res;
  const body = await req.json().catch(() => ({}));
  const data: { label?: string | null; status?: string; passcode?: string | null } = {};
  if (body.label !== undefined) data.label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 80) : null;
  if (body.status === "ACTIVE" || body.status === "CLOSED") data.status = body.status;
  if (body.passcode !== undefined) {
    const p = typeof body.passcode === "string" ? body.passcode.trim().toUpperCase() : "";
    if (p && !PASSCODE_RE.test(p)) return NextResponse.json({ error: "BAD_PASSCODE", message: "Passcode 6–32 huruf/nombor." }, { status: 400 });
    data.passcode = p || null;
  }
  const endpoint = await db.duelDisplayEndpoint.update({ where: { id: g.id }, data });
  return NextResponse.json({ endpoint });
}

export async function DELETE(_req: NextRequest, ctx: Params) {
  const g = await guard(ctx);
  if ("res" in g) return g.res;
  await db.duelDisplayEndpoint.delete({ where: { id: g.id } });
  return NextResponse.json({ ok: true });
}
