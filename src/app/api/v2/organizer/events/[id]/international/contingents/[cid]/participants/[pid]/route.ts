import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadForeignContingent, parseForeignParticipant, requireInternationalAdmin } from "@/lib/international";

type Params = { params: Promise<{ id: string; cid: string; pid: string }> };

async function load(cid: string, pid: string) {
  const found = await loadForeignContingent(cid);
  if (found.error) return { error: found.error } as const;
  const p = await db.participant.findUnique({ where: { id: pid }, select: { id: true, contingentId: true } });
  if (!p || p.contingentId !== cid)
    return { error: NextResponse.json({ error: "PARTICIPANT_NOT_FOUND" }, { status: 404 }) } as const;
  return { participant: p } as const;
}

/** PATCH — replace the participant's details (the full form is sent). */
export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  const { cid, pid } = await params;

  const found = await load(cid, pid);
  if ("error" in found) return found.error;

  const parsed = parseForeignParticipant(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const dup = await db.participant.findFirst({
    where:  { contingentId: cid, passport: parsed.data.passport, id: { not: pid } },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ error: "DUPLICATE_PASSPORT" }, { status: 409 });

  await db.participant.update({ where: { id: pid }, data: parsed.data });
  return NextResponse.json({ ok: true });
}

/** DELETE — only while the participant is in no team. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  const { cid, pid } = await params;

  const found = await load(cid, pid);
  if ("error" in found) return found.error;

  const inTeam = await db.teamMember.findFirst({ where: { participantId: pid }, select: { id: true } });
  if (inTeam) return NextResponse.json({ error: "PARTICIPANT_IN_TEAM" }, { status: 400 });

  await db.participant.delete({ where: { id: pid } });
  return NextResponse.json({ ok: true });
}
