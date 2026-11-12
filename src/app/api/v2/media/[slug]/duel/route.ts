import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authMedia } from "@/lib/media-endpoint";
import { isStreamLive, streamConfigured } from "@/lib/cf-stream";
import { isLeagueRound, parseDuelConfig, roundTitle, sessionTitle } from "@/lib/duel";
import { activeMerges } from "@/lib/team-merge-server";

export const dynamic = "force-dynamic";

// GET — duel sessions the media team can film: each bracket's current (latest
// confirmed) round, with arena, teams and video state.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await authMedia(req, slug);
  if ("res" in a) return a.res;

  const ecs = await db.eventCompetition.findMany({
    where: { eventId: a.ep.eventId, judgingMethod: "DUEL" },
    select: {
      id: true, duelConfig: true, competition: { select: { code: true, name: true } },
      duelRounds: {
        where: { status: { not: "DRAFT" } },
        orderBy: [{ groupKey: "asc" }, { number: "desc" }],
        select: {
          id: true, groupKey: true, number: true, stage: true, isFinal: true,
          sessions: {
            where: { arena: { gt: 0 } },
            orderBy: [{ wave: "asc" }, { number: "asc" }],
            select: {
              id: true, label: true, arena: true, scheduledAt: true, status: true,
              streamPlaybackUrl: true, streamHeartbeatAt: true, replayStatus: true,
              entries: { orderBy: { slot: "asc" }, select: { teamId: true, team: { select: { name: true, contingent: { select: { name: true, shortName: true } } } } } },
            },
          },
        },
      },
    },
  });
  ecs.sort((x, y) => x.competition.code.localeCompare(y.competition.code, undefined, { numeric: true }));

  // STATE-scope brackets are keyed by state id.
  const stateIds = [...new Set(ecs.flatMap(ec => ec.duelRounds.map(r => r.groupKey)).filter(Boolean))];
  const stateName = new Map((await db.state.findMany({ where: { id: { in: stateIds } }, select: { id: true, name: true } })).map(st => [st.id, st.name]));
  const rank = (st: string) => (st === "RUNNING" || st === "PAUSED" ? 0 : st === "PENDING" ? 1 : st === "ENDED" ? 2 : 3);

  // Merged state teams: entries carry the lead team's id.
  const mergeOf = new Map<string, { name: string; contingent: string }>();
  for (const ec of ecs) for (const m of (await activeMerges(ec.id)) ?? []) mergeOf.set(m.teamIds[0], { name: m.name, contingent: `${m.teamIds.length} pasukan` });

  const now = Date.now();
  const competitions = ecs.map(ec => {
    // Latest round per bracket.
    const latest = new Map<string, (typeof ec.duelRounds)[number]>();
    for (const r of ec.duelRounds) if (!latest.has(r.groupKey)) latest.set(r.groupKey, r);
    return {
      id: ec.id, code: ec.competition.code, name: ec.competition.name,
      scope: parseDuelConfig(ec.duelConfig).scope,
      sessions: [...latest.values()].flatMap(r => r.sessions.map(s => ({
        id: s.id,
        label: sessionTitle(r, s),
        round: roundTitle(r, isLeagueRound(r)),
        group: r.groupKey ? stateName.get(r.groupKey) ?? "Tiada negeri" : null,
        arena: s.arena, scheduledAt: s.scheduledAt, status: s.status,
        live: isStreamLive(s, now), replayStatus: s.replayStatus,
        teams: s.entries.map(e => mergeOf.get(e.teamId) ?? { name: e.team.name, contingent: e.team.contingent.shortName || e.team.contingent.name }),
      }))).sort((x, y) => rank(x.status) - rank(y.status)),
    };
  });
  return NextResponse.json({ configured: streamConfigured(), competitions, serverNow: now });
}
