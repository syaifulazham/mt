import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { MEDAL_WRITE_ROLES } from "@/lib/medalTally";

type Ctx = { params: Promise<{ id: string; epId: string }> };

async function authorize(ctx: Ctx) {
  const session = await getOrganizerSession();
  if (!session) return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  if (!MEDAL_WRITE_ROLES.includes(session.role)) return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  const { id: eventId, epId } = await ctx.params;
  const existing = await db.medalTallyEndpoint.findFirst({ where: { id: epId, eventId } });
  if (!existing) return { error: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }) };
  return { existing };
}

const patchSchema = z.object({
  label: z.string().trim().max(120).nullable().optional(),
  status: z.enum(["ACTIVE", "CLOSED"]).optional(),
});

// PATCH /api/v2/organizer/events/[id]/medal-tally-endpoints/[epId]
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(ctx);
  if ("error" in auth) return auth.error;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  const b = parsed.data;

  const updated = await db.medalTallyEndpoint.update({
    where: { id: auth.existing.id },
    data: {
      ...(b.label !== undefined && { label: b.label || null }),
      ...(b.status !== undefined && { status: b.status }),
    },
  });
  return NextResponse.json({ data: updated });
}

// DELETE /api/v2/organizer/events/[id]/medal-tally-endpoints/[epId]
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await authorize(ctx);
  if ("error" in auth) return auth.error;
  await db.medalTallyEndpoint.delete({ where: { id: auth.existing.id } });
  return NextResponse.json({ success: true });
}
