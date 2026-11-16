import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseRange } from "@/lib/voting";
import { findVotingSession, votingGuard } from "@/lib/voting-auth";

type P = { params: Promise<{ id: string; ecId: string; sid: string }> };

// PATCH — { label?, description?, minScore?, maxScore?, status?, showResults? }.
// The score range is fixed once ballots exist, so every vote is on one scale.
export async function PATCH(req: NextRequest, { params }: P) {
  const { id, ecId, sid } = await params;
  const g = await votingGuard(id, ecId, true);
  if (g.res) return g.res;
  const s = await findVotingSession(ecId, sid);
  if (!s) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.label !== undefined) {
    const label = String(body.label).trim().slice(0, 120);
    if (!label) return NextResponse.json({ error: "Nama sesi undian diperlukan" }, { status: 400 });
    data.label = label;
  }
  if (body.description !== undefined) data.description = String(body.description ?? "").trim().slice(0, 2000) || null;
  if (body.status !== undefined) {
    if (!["ACTIVE", "CLOSED"].includes(body.status)) return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });
    data.status = body.status;
  }
  if (body.showResults !== undefined) data.showResults = body.showResults === true;
  if (body.minScore !== undefined || body.maxScore !== undefined) {
    const range = parseRange(body.minScore ?? s.minScore, body.maxScore ?? s.maxScore);
    if (typeof range === "string") return NextResponse.json({ error: range }, { status: 400 });
    if (range.minScore !== s.minScore || range.maxScore !== s.maxScore) {
      if (await db.votingBallot.count({ where: { sessionId: sid } }))
        return NextResponse.json({ error: "Julat skor tidak boleh diubah selepas undian diterima" }, { status: 409 });
      Object.assign(data, range);
    }
  }
  const updated = await db.votingSession.update({ where: { id: sid }, data });
  return NextResponse.json({ session: updated });
}

// DELETE — the session, its entries and every ballot.
export async function DELETE(_req: NextRequest, { params }: P) {
  const { id, ecId, sid } = await params;
  const g = await votingGuard(id, ecId, true);
  if (g.res) return g.res;
  const s = await findVotingSession(ecId, sid);
  if (!s) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  await db.votingSession.delete({ where: { id: sid } });
  return NextResponse.json({ ok: true });
}
