import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternationalAdmin } from "@/lib/international";
import { INTL_LINK_SELECT, currentInternationalLink, genInternationalPasscode } from "@/lib/international-link";

type Params = { params: Promise<{ id: string; lid: string }> };

async function guard(params: Params["params"]) {
  if (currentInternationalLink()) return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) } as const;
  const g = await requireInternationalAdmin();
  if ("error" in g) return { error: g.error } as const;
  const { id: eventId, lid } = await params;
  const link = await db.internationalLink.findFirst({ where: { id: lid, eventId }, select: { id: true } });
  if (!link) return { error: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }) } as const;
  return { link } as const;
}

// PATCH { label?, scope?, active?, newPasscode? } — rename, change scope, close /
// reopen, or issue a new passcode (the old one stops working at once).
export async function PATCH(req: NextRequest, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => ({})) as { label?: unknown; scope?: unknown; active?: unknown; newPasscode?: unknown };
  const data: { label?: string | null; scope?: string; active?: boolean; passcode?: string } = {};
  if (body.label !== undefined) data.label = String(body.label ?? "").trim().slice(0, 80) || null;
  if (body.scope !== undefined) data.scope = body.scope === "OWN" ? "OWN" : "ALL";
  if (body.active !== undefined) data.active = body.active === true;
  if (body.newPasscode === true) data.passcode = genInternationalPasscode();
  const { contingentIds, ...link } = await db.internationalLink.update({ where: { id: g.link.id }, data, select: INTL_LINK_SELECT });
  return NextResponse.json({ link: { ...link, schools: contingentIds.length } });
}

// DELETE — remove the link; its URL stops working. What was registered through it stays.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;
  await db.internationalLink.delete({ where: { id: g.link.id } });
  return NextResponse.json({ ok: true });
}
