import { parseSharedRankMode } from "@/lib/sharedRank";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isLeagueRound, parseDuelConfig, remainingMs, roundTitle, sessionTitle } from "@/lib/duel";
import { loadRounds, standingsOf, type DuelTeam } from "@/lib/duel-server";

export const dynamic = "force-dynamic";

const pubTeam = (t: DuelTeam) => ({
  name: t.name, contingent: t.contingentName, state: t.stateName, flagUrl: t.flagUrl, logoUrl: t.logoUrl,
});

// POST /api/duel/[slug] { passcode? } — public duel screen.
// SCHEDULE: confirmed rounds, sessions and standings. LIVE: each arena's
// running session with its clock, and what is next. Draft draws never leave
// the server.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await req.json().catch(() => ({}))) as { passcode?: unknown };

  const endpoint = await db.duelDisplayEndpoint.findUnique({
    where: { routeSlug: slug },
    include: { event: { select: { id: true, name: true, sharedRankMode: true } } },
  });
  if (!endpoint) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (endpoint.status === "CLOSED") return NextResponse.json({ error: "ENDPOINT_CLOSED" }, { status: 403 });
  if (endpoint.passcode) {
    const given = typeof body.passcode === "string" ? body.passcode.trim().toUpperCase() : "";
    if (!given) return NextResponse.json({ error: "PASSCODE_REQUIRED" }, { status: 401 });
    if (given !== endpoint.passcode) return NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 401 });
  }

  const ecs = await db.eventCompetition.findMany({
    where: {
      eventId: endpoint.eventId, judgingMethod: "DUEL",
      ...(endpoint.competitionIds.length ? { id: { in: endpoint.competitionIds } } : {}),
    },
    select: { id: true, duelConfig: true, competition: { select: { name: true, code: true } } },
  });
  ecs.sort((a, b) => a.competition.code.localeCompare(b.competition.code, undefined, { numeric: true }));
  const now = Date.now();

  const competitions = await Promise.all(ecs.map(async ec => {
    const cfg = parseDuelConfig(ec.duelConfig);
    const all = (await loadRounds(ec.id)).filter(r => r.status !== "DRAFT");
    const head = { id: ec.id, code: ec.competition.code, name: ec.competition.name, scope: cfg.scope, durationSec: cfg.durationSec, advance: cfg.advance };
    // Brackets: one national, or one per state (STATE scope), named from their teams.
    const keys = [...new Set(all.map(r => r.groupKey))];
    const nameOf = (key: string) => {
      if (!key) return { name: null, flagUrl: null };
      const t = all.find(r => r.groupKey === key)?.sessions[0]?.entries[0]?.team;
      return { name: t?.stateName ?? "Tiada negeri", flagUrl: t?.flagUrl ?? null };
    };
    const groups = keys.map(key => ({ key, ...nameOf(key), rounds: all.filter(r => r.groupKey === key) }))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

    if (endpoint.kind === "LIVE") {
      // Arenas are shared by every bracket: each shows its running session and what is next.
      const playing = groups.flatMap(g => {
        const current = g.rounds.find(r => r.status === "CONFIRMED");
        return (current?.sessions ?? []).filter(s => s.arena > 0).map(s => ({ s, round: current!, group: g.name }));
      });
      const dto = ({ s, round, group }: (typeof playing)[number]) => ({
        id: s.id, label: sessionTitle(round, s), group,
        round: roundTitle(round, isLeagueRound(round)),
        status: s.status, scheduledAt: s.scheduledAt,
        remainingMs: remainingMs(s, cfg.durationSec, now),
        video: s.video,
        teams: s.entries.map(e => pubTeam(e.team)),
      });
      const order = (a: (typeof playing)[number], b: (typeof playing)[number]) =>
        (a.s.scheduledAt?.getTime() ?? 0) - (b.s.scheduledAt?.getTime() ?? 0) || a.s.wave - b.s.wave || a.s.number - b.s.number;
      const arenas = [...new Set(playing.map(p => p.s.arena))].sort((a, b) => a - b).map(arena => {
        const list = playing.filter(p => p.s.arena === arena).sort(order);
        const live = list.find(p => p.s.status === "RUNNING") ?? list.find(p => ["PAUSED", "ENDED"].includes(p.s.status)) ?? null;
        const next = list.find(p => p.s.status === "PENDING") ?? null;
        return { arena, live: live && dto(live), next: next && dto(next) };
      });
      return { ...head, arenas };
    }

    return {
      ...head,
      groups: groups.map(g => ({
        key: g.key, name: g.name, flagUrl: g.flagUrl,
        rounds: g.rounds.map(r => ({
          number: r.number, isFinal: r.isFinal, status: r.status, title: roundTitle(r, isLeagueRound(r)),
          sessions: r.sessions.map(s => ({
            id: s.id, label: sessionTitle(r, s), arena: s.arena, scheduledAt: s.scheduledAt, status: s.status,
            teams: [...s.entries]
              .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.slot - b.slot)
              .map(e => ({ ...pubTeam(e.team), rank: e.rank, points: e.points, advanced: e.advanced })),
          })),
        })),
        finished: g.rounds.some(r => r.isFinal && r.status === "DONE"),
        standings: standingsOf(g.rounds, parseSharedRankMode(endpoint.event.sharedRankMode)).map(s => ({ position: s.position, total: s.total, ...pubTeam(s.team) })),
      })),
    };
  }));

  return NextResponse.json({
    kind: endpoint.kind, label: endpoint.label, event: { name: endpoint.event.name },
    competitions, serverNow: now,
  });
}
