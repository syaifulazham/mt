import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadForeignContingent, parseForeignTrainer, requireInternationalAdmin } from "@/lib/international";

/** POST — add a trainer / teacher (Jurulatih) to a foreign school. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  const { cid } = await params;

  const found = await loadForeignContingent(cid);
  if ("error" in found) return found.error;

  const parsed = parseForeignTrainer(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const trainer = await db.trainer.create({ data: { ...parsed.data, contingentId: cid }, select: { id: true } });
  return NextResponse.json({ data: trainer }, { status: 201 });
}
