import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webcraftConfigured } from "@/lib/eptim-webcraft";
import { parseLinks } from "@/lib/voting";
import { findVotingSession, isWebcraftCompetition, votingGuard } from "@/lib/voting-auth";
import { webcraftLinks } from "@/lib/voting-webcraft";

type P = { params: Promise<{ id: string; ecId: string; sid: string }> };

// POST — give every team entry that has no links its latest published WebCraft
// project. Entries that already have links are left alone.
export async function POST(_req: NextRequest, { params }: P) {
  const { id, ecId, sid } = await params;
  const g = await votingGuard(id, ecId, true);
  if (g.res) return g.res;
  if (!(await findVotingSession(ecId, sid))) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!(await isWebcraftCompetition(g.ec.competitionId))) return NextResponse.json({ error: "Pertandingan ini tidak berintegrasi dengan WebCraft" }, { status: 400 });
  if (!webcraftConfigured()) return NextResponse.json({ error: "WebCraft tidak dikonfigurasi" }, { status: 503 });

  let projects: Awaited<ReturnType<typeof webcraftLinks>>;
  try { projects = await webcraftLinks(g.ec); }
  catch (e) {
    console.error("[voting] webcraft fill failed:", (e as Error).message);
    return NextResponse.json({ error: "Gagal membaca projek WebCraft" }, { status: 502 });
  }

  const entries = await db.votingEntry.findMany({ where: { sessionId: sid, teamId: { not: null } }, select: { id: true, teamId: true, links: true } });
  let filled = 0, noProject = 0;
  for (const e of entries) {
    if (parseLinks(e.links).length) continue;
    const p = projects[e.teamId!]?.[0];
    if (!p) { noProject++; continue; }
    await db.votingEntry.update({ where: { id: e.id }, data: { links: parseLinks([{ label: p.name, url: p.url }]) } });
    filled++;
  }
  return NextResponse.json({ filled, noProject });
}
