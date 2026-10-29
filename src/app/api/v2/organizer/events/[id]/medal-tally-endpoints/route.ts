import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { MEDAL_TALLY_SCOPES, MEDAL_WRITE_ROLES, generatePasscode, generateRouteSlug } from "@/lib/medalTally";

// GET /api/v2/organizer/events/[id]/medal-tally-endpoints
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id: eventId } = await params;
  const rows = await db.medalTallyEndpoint.findMany({ where: { eventId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ data: rows });
}

const createSchema = z.object({
  label: z.string().trim().max(120).optional(),
  requirePasscode: z.boolean().optional(),
});

// POST /api/v2/organizer/events/[id]/medal-tally-endpoints
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!MEDAL_WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id: eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { scope: true } });
  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  if (!MEDAL_TALLY_SCOPES.includes(event.scope)) return NextResponse.json({ error: "NOT_NATIONAL" }, { status: 400 });

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

  const endpoint = await db.medalTallyEndpoint.create({
    data: {
      eventId,
      routeSlug: generateRouteSlug(),
      passcode: parsed.data.requirePasscode ? generatePasscode() : null,
      label: parsed.data.label || null,
    },
  });
  return NextResponse.json({ data: endpoint }, { status: 201 });
}
