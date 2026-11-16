import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseLinks } from "@/lib/voting";
import { votingGuard } from "@/lib/voting-auth";

type P = { params: Promise<{ id: string; ecId: string; sid: string; entryId: string }> };

async function findEntry(ecId: string, sid: string, entryId: string) {
  return db.votingEntry.findFirst({ where: { id: entryId, sessionId: sid, session: { eventCompetitionId: ecId } } });
}

// PATCH — { title?, subtitle?, links?, sortOrder? }
export async function PATCH(req: NextRequest, { params }: P) {
  const { id, ecId, sid, entryId } = await params;
  const g = await votingGuard(id, ecId, true);
  if (g.res) return g.res;
  if (!(await findEntry(ecId, sid, entryId))) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const title = String(body.title).trim().slice(0, 200);
    if (!title) return NextResponse.json({ error: "Tajuk penyertaan diperlukan" }, { status: 400 });
    data.title = title;
  }
  if (body.subtitle !== undefined) data.subtitle = String(body.subtitle ?? "").trim().slice(0, 200) || null;
  if (body.links !== undefined) data.links = parseLinks(body.links);
  if (Number.isInteger(body.sortOrder)) data.sortOrder = body.sortOrder;
  const entry = await db.votingEntry.update({ where: { id: entryId }, data });
  return NextResponse.json({ entry: { ...entry, links: parseLinks(entry.links) } });
}

// DELETE — the entry and its ballots.
export async function DELETE(_req: NextRequest, { params }: P) {
  const { id, ecId, sid, entryId } = await params;
  const g = await votingGuard(id, ecId, true);
  if (g.res) return g.res;
  if (!(await findEntry(ecId, sid, entryId))) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  await db.votingEntry.delete({ where: { id: entryId } });
  return NextResponse.json({ ok: true });
}
