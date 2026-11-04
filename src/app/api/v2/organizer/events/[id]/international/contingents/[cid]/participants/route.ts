import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadForeignContingent, parseForeignParticipant, requireInternationalAdmin } from "@/lib/international";

/**
 * POST — add a foreign participant (passport + birth date instead of an IC).
 * Not gated by the registration Open/Close switch: organizer-only.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  const { cid } = await params;

  const found = await loadForeignContingent(cid);
  if ("error" in found) return found.error;

  const parsed = parseForeignParticipant(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const dup = await db.participant.findFirst({
    where:  { contingentId: cid, passport: parsed.data.passport },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ error: "DUPLICATE_PASSPORT" }, { status: 409 });

  const participant = await db.participant.create({
    data:   { ...parsed.data, contingentId: cid },
    select: { id: true },
  });
  return NextResponse.json({ data: participant }, { status: 201 });
}
