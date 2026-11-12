import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { asDuelEndpoint } from "@/lib/duel-control";
import { loadRounds, parseDuelConfig, withClock } from "@/lib/duel-server";
import { samePasscode } from "@/lib/duel-scorecard-link";
import { competitionTitle } from "@/lib/competition-split";
import * as ranksRoute from "@/app/api/v2/organizer/events/[id]/competitions/[ecId]/duel/sessions/[sid]/ranks/route";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string }> };

async function findLink(slug: string) {
  return db.duelScorecardLink.findUnique({
    where: { routeSlug: slug },
    select: {
      id: true, passcode: true, sessionId: true, eventCompetitionId: true, lastUsedAt: true,
      session: {
        select: {
          label: true, number: true, pool: true,
          round: {
            select: {
              number: true, stage: true, isFinal: true,
              eventCompetition: {
                select: {
                  eventId: true, splitLabel: true, duelConfig: true,
                  event: { select: { name: true } }, competition: { select: { code: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });
}

const headOf = (l: NonNullable<Awaited<ReturnType<typeof findLink>>>) => {
  const ec = l.session.round.eventCompetition;
  return {
    event: ec.event.name,
    competition: { code: ec.competition.code, name: competitionTitle(ec.competition.name, ec.splitLabel) },
    // "Sesi A", or "Perlawanan A1" / "M1" in a league bracket.
    session: `${l.session.round.stage === "GROUP" || /^M\d/.test(l.session.label) ? "Perlawanan" : "Sesi"} ${l.session.label}`,
  };
};

// GET — what the passcode screen shows.
export async function GET(_req: NextRequest, { params }: Params) {
  const link = await findLink((await params).slug);
  if (!link) return NextResponse.json({ error: "NOT_FOUND", message: "Pautan kad skor tidak wujud." }, { status: 404 });
  return NextResponse.json(headOf(link));
}

// POST { passcode, action: "load" } — the session, its teams and the scorecard.
// POST { passcode, action: "save", ranks, tallies } — save the result through
// the organizer ranks handler, as an OPERATOR of this competition.
export async function POST(req: NextRequest, { params }: Params) {
  const link = await findLink((await params).slug);
  if (!link) return NextResponse.json({ error: "NOT_FOUND", message: "Pautan kad skor tidak wujud." }, { status: 404 });
  const body = await req.json().catch(() => ({})) as { passcode?: string; action?: string; ranks?: unknown; tallies?: unknown };
  if (!body.passcode || !samePasscode(body.passcode, link.passcode))
    return NextResponse.json({ error: "WRONG_PASSCODE", message: "Kod laluan salah." }, { status: 403 });
  const ec = link.session.round.eventCompetition;
  const cfg = parseDuelConfig(ec.duelConfig);
  if (!link.lastUsedAt || Date.now() - link.lastUsedAt.getTime() > 60_000)
    await db.duelScorecardLink.update({ where: { id: link.id }, data: { lastUsedAt: new Date() } });

  if (body.action === "save") {
    const inner = new NextRequest(req.url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ranks: body.ranks, tallies: body.tallies }),
    });
    return asDuelEndpoint(
      { id: `scorecard:${link.id}`, email: "", name: `Kad skor ${headOf(link).session}`, role: "OPERATOR", ecId: link.eventCompetitionId },
      () => ranksRoute.POST(inner, { params: Promise.resolve({ id: ec.eventId, ecId: link.eventCompetitionId, sid: link.sessionId }) }),
    );
  }

  const round = (await loadRounds(link.eventCompetitionId)).find(r => r.sessions.some(s => s.id === link.sessionId));
  const s = round?.sessions.find(x => x.id === link.sessionId);
  if (!round || !s) return NextResponse.json({ error: "NOT_FOUND", message: "Sesi tidak dijumpai." }, { status: 404 });
  return NextResponse.json({
    ...headOf(link),
    card: cfg.scorecard,
    allowDraw: round.stage === "GROUP" && cfg.allowDraw,
    advance: cfg.advance,
    round: { stage: round.stage, isFinal: round.isFinal },
    status: s.status, arena: s.arena,
    remainingMs: withClock(s, cfg.durationSec, Date.now()).remainingMs, serverNow: Date.now(),
    entries: s.entries.map(e => ({ id: e.id, teamId: e.teamId, slot: e.slot, rank: e.rank, tally: e.tally, score: e.score, team: e.team })),
  });
}
