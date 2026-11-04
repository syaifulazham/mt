import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadForeignContingent, parseForeignTrainer, requireInternationalAdmin } from "@/lib/international";

type Params = { params: Promise<{ id: string; cid: string; trid: string }> };

async function load(cid: string, trid: string) {
  const found = await loadForeignContingent(cid);
  if (found.error) return { error: found.error } as const;
  const t = await db.trainer.findUnique({ where: { id: trid }, select: { contingentId: true } });
  if (!t || t.contingentId !== cid)
    return { error: NextResponse.json({ error: "TRAINER_NOT_FOUND" }, { status: 404 }) } as const;
  return { ok: true } as const;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  const { cid, trid } = await params;

  const found = await load(cid, trid);
  if ("error" in found) return found.error;

  const parsed = parseForeignTrainer(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  await db.trainer.update({ where: { id: trid }, data: parsed.data });
  return NextResponse.json({ ok: true });
}

/** DELETE — also unassigns the trainer from its teams (team_trainers cascade). */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  const { cid, trid } = await params;

  const found = await load(cid, trid);
  if ("error" in found) return found.error;

  await db.trainer.delete({ where: { id: trid } });
  return NextResponse.json({ ok: true });
}
