import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { genScoreboardPasscode, parseEventOverride, parseHeaderStyle, parsePaging, SCOREBOARD_PASSCODE_RE } from "@/lib/vb-scoreboard";

const ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];
type Params = { params: Promise<{ id: string; wicId: string; sid: string }> };
const SELECT = { id: true, routeSlug: true, passcode: true, label: true, vibeBlocksEventId: true, pageSize: true, pageSeconds: true, headerStyle: true, active: true, createdAt: true } as const;

async function guard(params: Params["params"]) {
  const session = await getOrganizerSession();
  if (!session) return { res: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  if (!ROLES.includes(session.role)) return { res: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  const { id, wicId, sid } = await params;
  const row = await db.walkInScoreboardEndpoint.findUnique({
    where: { id: sid }, select: { id: true, walkInCompetitionId: true, walkInCompetition: { select: { eventId: true } } },
  });
  if (!row || row.walkInCompetitionId !== wicId || row.walkInCompetition.eventId !== id)
    return { res: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }) };
  return { row };
}

/** PATCH { label?, active?, passcode?, vibeBlocksEventId? } — passcode: "" removes it, "new" generates one, else the given value. vibeBlocksEventId: "" = back to the competition's own event. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const g = await guard(params);
  if ("res" in g) return g.res;
  const body = (await req.json().catch(() => ({}))) as { label?: unknown; active?: unknown; passcode?: unknown; vibeBlocksEventId?: unknown; pageSize?: unknown; pageSeconds?: unknown; headerStyle?: unknown };
  const paging = parsePaging(body);
  if ("error" in paging) return NextResponse.json({ error: "INVALID_PAGING", message: paging.error }, { status: 400 });
  const header = parseHeaderStyle(body.headerStyle);
  if ("error" in header) return NextResponse.json({ error: "INVALID_HEADER", message: header.error }, { status: 400 });
  const data: { label?: string | null; active?: boolean; passcode?: string | null; vibeBlocksEventId?: string | null; pageSize?: number; pageSeconds?: number; headerStyle?: string } = { ...paging, ...(header.value ? { headerStyle: header.value } : {}) };
  const ev = await parseEventOverride(body.vibeBlocksEventId);
  if ("error" in ev) return NextResponse.json({ error: "INVALID_EVENT", message: ev.error }, { status: 400 });
  if (ev.value !== undefined) data.vibeBlocksEventId = ev.value;
  if (body.label !== undefined) data.label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 80) : null;
  if (typeof body.active === "boolean") data.active = body.active;
  if (body.passcode !== undefined) {
    const p = typeof body.passcode === "string" ? body.passcode.trim() : "";
    if (!p) data.passcode = null;
    else if (p === "new") data.passcode = genScoreboardPasscode();
    else if (SCOREBOARD_PASSCODE_RE.test(p)) data.passcode = p.toUpperCase();
    else return NextResponse.json({ error: "INVALID_PASSCODE", message: "Passcode mesti 4–32 huruf atau nombor." }, { status: 400 });
  }
  const updated = await db.walkInScoreboardEndpoint.update({ where: { id: g.row.id }, data, select: SELECT });
  return NextResponse.json({ data: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const g = await guard(params);
  if ("res" in g) return g.res;
  await db.walkInScoreboardEndpoint.delete({ where: { id: g.row.id } });
  return NextResponse.json({ ok: true });
}
