import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternationalAdmin } from "@/lib/international";
import { INTL_LINK_SELECT, currentInternationalLink, genInternationalPasscode, genInternationalSlug } from "@/lib/international-link";

type Params = { params: Promise<{ id: string }> };

const dto = <T extends { contingentIds: string[] }>({ contingentIds, ...l }: T) => ({ ...l, schools: contingentIds.length });

/** Organizers only: a registration link can never manage links. */
async function guard() {
  if (currentInternationalLink()) return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) } as const;
  return requireInternationalAdmin();
}

// GET — the event's third-party registration links.
export async function GET(_req: NextRequest, { params }: Params) {
  const g = await guard();
  if ("error" in g) return g.error;
  const links = await db.internationalLink.findMany({ where: { eventId: (await params).id }, orderBy: { createdAt: "desc" }, select: INTL_LINK_SELECT });
  return NextResponse.json({ links: links.map(dto) });
}

// POST { label?, scope? } — create a link with a random 6-character passcode.
// scope ALL reaches every foreign school; OWN only the schools created through the link.
export async function POST(req: NextRequest, { params }: Params) {
  const g = await guard();
  if ("error" in g) return g.error;
  const { id: eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  const body = await req.json().catch(() => ({})) as { label?: unknown; scope?: unknown };
  const link = await db.internationalLink.create({
    data: {
      eventId, routeSlug: await genInternationalSlug(), passcode: genInternationalPasscode(),
      label: String(body.label ?? "").trim().slice(0, 80) || null,
      scope: body.scope === "OWN" ? "OWN" : "ALL",
      createdBy: g.session.name ?? g.session.email ?? g.session.id,
    },
    select: INTL_LINK_SELECT,
  });
  return NextResponse.json({ link: dto(link) }, { status: 201 });
}
