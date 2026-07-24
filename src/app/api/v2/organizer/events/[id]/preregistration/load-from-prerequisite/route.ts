import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

function getEffectiveStateId(
  contingent: {
    stateId: string | null;
    school: { stateId: string | null } | null;
    higherInstitution: { stateId: string | null } | null;
  } | null,
): string | null {
  return contingent?.stateId
    ?? contingent?.school?.stateId
    ?? contingent?.higherInstitution?.stateId
    ?? null;
}

async function loadStateFilter(eventId: string): Promise<string[]> {
  const key = `event_prereq_state_filter:${eventId}`;
  const setting = await db.appSetting.findUnique({ where: { key } });
  return setting ? (JSON.parse(setting.value) as string[]) : [];
}

/**
 * GET — List teams from prerequisite events so the organizer can pick which
 *       ones to load.  Returns groups keyed by prerequisite event.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;

  const [event, stateFilter] = await Promise.all([
    db.event.findUnique({
      where: { id: eventId },
      select: {
        prerequisites: {
          select: {
            prerequisiteId: true,
            prerequisite: { select: { id: true, name: true } },
          },
        },
      },
    }),
    loadStateFilter(eventId),
  ]);

  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  if (event.prerequisites.length === 0) return NextResponse.json({ groups: [], stateFilter });

  const prerequisiteIds = event.prerequisites.map((p) => p.prerequisiteId);

  // Only selected teams from prerequisite events
  const prereqTeamEvents = await db.teamEvent.findMany({
    where: { eventId: { in: prerequisiteIds }, selected: true },
    select: {
      eventId: true,
      teamId: true,
      team: {
        select: {
          id: true,
          name: true,
          _count: { select: { members: true } },
          competition: { select: { name: true, code: true } },
          contingent: {
            select: {
              name: true,
              shortName: true,
              stateId: true,
              school: { select: { stateId: true } },
              higherInstitution: { select: { stateId: true } },
            },
          },
        },
      },
    },
    orderBy: { team: { name: "asc" } },
  });

  // Apply state filter if configured
  const filteredTeamEvents = stateFilter.length > 0
    ? prereqTeamEvents.filter((te) => {
        const sid = getEffectiveStateId(te.team.contingent);
        return sid !== null && stateFilter.includes(sid);
      })
    : prereqTeamEvents;

  // Which teams are already registered to the target event?
  const allTeamIds = filteredTeamEvents.map((te) => te.teamId);
  const alreadySet = new Set(
    (await db.teamEvent.findMany({
      where: { eventId, teamId: { in: allTeamIds } },
      select: { teamId: true },
    })).map((e) => e.teamId),
  );

  // Group by prerequisite event; deduplicate teams that appear in several prereqs
  type GroupEntry = {
    id: string;
    name: string;
    teams: {
      id: string;
      name: string;
      contingentName: string | null;
      competitionCode: string | null;
      competitionName: string | null;
      members: number;
      alreadyRegistered: boolean;
    }[];
  };
  const groupMap = new Map<string, GroupEntry>();
  for (const p of event.prerequisites) {
    groupMap.set(p.prerequisiteId, { id: p.prerequisiteId, name: p.prerequisite.name, teams: [] });
  }

  const seen = new Set<string>();
  for (const te of filteredTeamEvents) {
    if (seen.has(te.teamId)) continue;
    seen.add(te.teamId);
    const group = groupMap.get(te.eventId);
    if (!group) continue;
    group.teams.push({
      id: te.team.id,
      name: te.team.name,
      contingentName: te.team.contingent?.shortName ?? te.team.contingent?.name ?? null,
      competitionCode: te.team.competition?.code ?? null,
      competitionName: te.team.competition?.name ?? null,
      members: te.team._count.members,
      alreadyRegistered: alreadySet.has(te.teamId),
    });
  }

  return NextResponse.json({ groups: [...groupMap.values()], stateFilter });
}

/**
 * POST — Register teams from prerequisite events into this event.
 *        If body contains { teamIds: string[] }, only those are loaded.
 *        Otherwise falls back to all `selected = true` teams (with state filter applied).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { prerequisites: { select: { prerequisiteId: true } } },
  });
  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  if (event.prerequisites.length === 0)
    return NextResponse.json({ error: "NO_PREREQUISITE" }, { status: 400 });

  const prerequisiteIds = event.prerequisites.map((p) => p.prerequisiteId);

  const body = await req.json().catch(() => ({})) as { teamIds?: string[] };
  let teamIds: string[];

  if (body.teamIds && body.teamIds.length > 0) {
    // Explicit selection from picker — trust the organizer's choice
    teamIds = body.teamIds;
  } else {
    // Legacy: load all `selected = true` teams (apply state filter)
    const stateFilter = await loadStateFilter(eventId);
    const selectedTeamEvents = await db.teamEvent.findMany({
      where: { eventId: { in: prerequisiteIds }, selected: true },
      select: {
        teamId: true,
        team: {
          select: {
            contingent: {
              select: {
                stateId: true,
                school: { select: { stateId: true } },
                higherInstitution: { select: { stateId: true } },
              },
            },
          },
        },
      },
    });

    const filtered = stateFilter.length > 0
      ? selectedTeamEvents.filter((te) => {
          const sid = getEffectiveStateId(te.team.contingent);
          return sid !== null && stateFilter.includes(sid);
        })
      : selectedTeamEvents;

    if (filtered.length === 0) return NextResponse.json({ added: 0, skipped: 0 });
    teamIds = [...new Set(filtered.map((te) => te.teamId))];
  }

  // Find which are already registered to the current event
  const existing = await db.teamEvent.findMany({
    where: { eventId, teamId: { in: teamIds } },
    select: { teamId: true },
  });
  const existingIds = new Set(existing.map((e) => e.teamId));
  const toAdd = teamIds.filter((id) => !existingIds.has(id));

  if (toAdd.length > 0) {
    await db.teamEvent.createMany({
      data: toAdd.map((teamId) => ({ teamId, eventId })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ added: toAdd.length, skipped: existingIds.size });
}
