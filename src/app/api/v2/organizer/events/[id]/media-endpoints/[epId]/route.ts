import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ENDPOINT_SELECT, MEDIA_ADMIN_ROLES, PASSCODE_RE, endpointDto, genMediaPasscode } from "@/lib/media-endpoint";

type Params = { params: Promise<{ id: string; epId: string }> };

async function guard(eventId: string, epId: string) {
  const session = await getOrganizerSession();
  if (!session) return { res: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  if (!MEDIA_ADMIN_ROLES.includes(session.role)) return { res: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  const ep = await db.mediaEndpoint.findFirst({ where: { id: epId, eventId }, select: { id: true } });
  if (!ep) return { res: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }) };
  return { ep };
}

// PATCH { label?, active?, passcode? | regeneratePasscode? }
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, epId } = await params;
  const g = await guard(id, epId);
  if ("res" in g) return g.res;
  const body = await req.json().catch(() => ({})) as { label?: string; active?: boolean; passcode?: string; regeneratePasscode?: boolean };
  let passcode: string | undefined;
  if (body.regeneratePasscode) passcode = genMediaPasscode();
  else if (body.passcode !== undefined) {
    passcode = body.passcode.trim().toUpperCase();
    if (!PASSCODE_RE.test(passcode))
      return NextResponse.json({ error: "INVALID_PASSCODE", message: "Passcode mesti 6–32 huruf atau nombor." }, { status: 400 });
  }
  const row = await db.mediaEndpoint.update({
    where: { id: epId },
    data: {
      ...(body.label !== undefined && { label: body.label.trim().slice(0, 80) || null }),
      ...(body.active !== undefined && { active: Boolean(body.active) }),
      ...(passcode && { passcode }),
    },
    select: ENDPOINT_SELECT,
  });
  return NextResponse.json({ data: endpointDto(row) });
}

// DELETE — the endpoint only; its galleries and photos stay (unlinked).
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, epId } = await params;
  const g = await guard(id, epId);
  if ("res" in g) return g.res;
  await db.mediaEndpoint.delete({ where: { id: epId } });
  return NextResponse.json({ ok: true });
}
