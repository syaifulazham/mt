import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ENDPOINT_SELECT, MEDIA_ADMIN_ROLES, PASSCODE_RE, endpointDto, genMediaPasscode, genMediaSlug } from "@/lib/media-endpoint";

// Media endpoints of an event (SUPER_ADMIN). See src/lib/media-endpoint.ts.

type Params = { params: Promise<{ id: string }> };

async function guard() {
  const session = await getOrganizerSession();
  if (!session) return { res: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  if (!MEDIA_ADMIN_ROLES.includes(session.role)) return { res: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  return { session };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const g = await guard();
  if ("res" in g) return g.res;
  const { id } = await params;
  const rows = await db.mediaEndpoint.findMany({ where: { eventId: id }, orderBy: { createdAt: "asc" }, select: ENDPOINT_SELECT });
  return NextResponse.json({ data: rows.map(endpointDto) });
}

// POST { label?, passcode? } — passcode optional (6–32 letters/digits); random 6 otherwise.
export async function POST(req: NextRequest, { params }: Params) {
  const g = await guard();
  if ("res" in g) return g.res;
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { label?: string; passcode?: string };
  const passcode = body.passcode?.trim() ? body.passcode.trim().toUpperCase() : genMediaPasscode();
  if (!PASSCODE_RE.test(passcode))
    return NextResponse.json({ error: "INVALID_PASSCODE", message: "Passcode mesti 6–32 huruf atau nombor." }, { status: 400 });
  const event = await db.event.findUnique({ where: { id }, select: { id: true } });
  if (!event) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const row = await db.mediaEndpoint.create({
    data: {
      eventId: id, routeSlug: await genMediaSlug(), passcode,
      label: body.label?.trim().slice(0, 80) || null,
      createdBy: g.session.name || g.session.email || null,
    },
    select: ENDPOINT_SELECT,
  });
  return NextResponse.json({ data: endpointDto(row) }, { status: 201 });
}
