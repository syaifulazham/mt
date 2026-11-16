import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { duelTeams } from "@/lib/duel-server";
import { entryWithTally, genVotingSlug, parseRange, tallySession } from "@/lib/voting";
import { isWebcraftCompetition, votingGuard } from "@/lib/voting-auth";

type P = { params: Promise<{ id: string; ecId: string }> };

// GET — the competition's voting sessions with entries and live tallies, plus
// its registered teams (for adding entries).
export async function GET(_req: NextRequest, { params }: P) {
  const { id, ecId } = await params;
  const g = await votingGuard(id, ecId, false);
  if (g.res) return g.res;

  const sessions = await db.votingSession.findMany({
    where: { eventCompetitionId: ecId },
    include: { entries: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    orderBy: { createdAt: "asc" },
  });
  const out = [];
  for (const s of sessions) {
    const tally = await tallySession(s.id);
    const voters = await db.votingBallot.findMany({ where: { sessionId: s.id }, distinct: ["voterKey"], select: { voterKey: true } });
    const { entries, ...rest } = s;
    out.push({ ...rest, voters: voters.length, entries: entries.map(e => entryWithTally(e, tally)) });
  }
  const teams = (await duelTeams(g.ec.eventId, g.ec.competitionId))
    .map(t => ({ id: t.id, name: t.name, contingentName: t.contingentName, stateName: t.stateName }));
  return NextResponse.json({ sessions: out, teams, webcraft: await isWebcraftCompetition(g.ec.competitionId) });
}

// POST — create a session. { label, description?, minScore, maxScore, showResults?, addAllTeams? }
export async function POST(req: NextRequest, { params }: P) {
  const { id, ecId } = await params;
  const g = await votingGuard(id, ecId, true);
  if (g.res) return g.res;

  const body = await req.json().catch(() => ({}));
  const label = String(body.label ?? "").trim().slice(0, 120);
  if (!label) return NextResponse.json({ error: "Nama sesi undian diperlukan" }, { status: 400 });
  const range = parseRange(body.minScore ?? 1, body.maxScore ?? 5);
  if (typeof range === "string") return NextResponse.json({ error: range }, { status: 400 });

  const teams = body.addAllTeams ? await duelTeams(g.ec.eventId, g.ec.competitionId) : [];
  const session = await db.votingSession.create({
    data: {
      eventCompetitionId: ecId, routeSlug: await genVotingSlug(), label,
      description: String(body.description ?? "").trim().slice(0, 2000) || null,
      ...range, showResults: body.showResults === true,
      entries: { create: teams.map((t, i) => ({ teamId: t.id, title: t.name, subtitle: t.contingentName, sortOrder: i })) },
    },
  });
  return NextResponse.json({ session: { id: session.id } }, { status: 201 });
}
