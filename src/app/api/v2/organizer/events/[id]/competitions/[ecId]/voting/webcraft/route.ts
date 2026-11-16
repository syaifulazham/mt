import { NextRequest, NextResponse } from "next/server";
import { webcraftConfigured } from "@/lib/eptim-webcraft";
import { webcraftLinks } from "@/lib/voting-webcraft";
import { isWebcraftCompetition, votingGuard } from "@/lib/voting-auth";

type P = { params: Promise<{ id: string; ecId: string }> };

// GET — { projects: { [teamId]: [{ id, name, url, updatedAt }] } }, latest first.
export async function GET(_req: NextRequest, { params }: P) {
  const { id, ecId } = await params;
  const g = await votingGuard(id, ecId, false);
  if (g.res) return g.res;
  if (!(await isWebcraftCompetition(g.ec.competitionId))) return NextResponse.json({ error: "Pertandingan ini tidak berintegrasi dengan WebCraft" }, { status: 400 });
  if (!webcraftConfigured()) return NextResponse.json({ error: "WebCraft tidak dikonfigurasi" }, { status: 503 });
  try {
    return NextResponse.json({ projects: await webcraftLinks(g.ec) });
  } catch (e) {
    console.error("[voting] webcraft projects failed:", (e as Error).message);
    return NextResponse.json({ error: "Gagal membaca projek WebCraft" }, { status: 502 });
  }
}
