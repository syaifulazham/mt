import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseLinks } from "@/lib/voting";
import { findVotingSession, votingGuard } from "@/lib/voting-auth";

type P = { params: Promise<{ id: string; ecId: string; sid: string }> };

// POST — add entries. { entries: [{ teamId?, title, subtitle?, links? }] }
export async function POST(req: NextRequest, { params }: P) {
  const { id, ecId, sid } = await params;
  const g = await votingGuard(id, ecId, true);
  if (g.res) return g.res;
  const s = await findVotingSession(ecId, sid);
  if (!s) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const raw: unknown[] = Array.isArray(body.entries) ? body.entries.slice(0, 500) : [];
  const last = await db.votingEntry.aggregate({ where: { sessionId: sid }, _max: { sortOrder: true } });
  let order = (last._max.sortOrder ?? -1) + 1;
  const data = raw.flatMap((r) => {
    const e = r as { teamId?: unknown; title?: unknown; subtitle?: unknown; links?: unknown };
    const title = String(e.title ?? "").trim().slice(0, 200);
    if (!title) return [];
    return [{
      sessionId: sid, title,
      teamId: typeof e.teamId === "string" && e.teamId ? e.teamId : null,
      subtitle: String(e.subtitle ?? "").trim().slice(0, 200) || null,
      links: parseLinks(e.links), sortOrder: order++,
    }];
  });
  if (!data.length) return NextResponse.json({ error: "Tajuk penyertaan diperlukan" }, { status: 400 });
  await db.votingEntry.createMany({ data });
  return NextResponse.json({ added: data.length }, { status: 201 });
}
