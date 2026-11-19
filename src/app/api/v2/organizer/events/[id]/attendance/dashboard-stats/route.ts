import { NextRequest, NextResponse } from "next/server";
import { onsiteOnly } from "@/lib/onlineCompetition";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * GET ?mode=counter|individual — the attendance dashboard's numbers.
 *
 * counter (default): a team is present once its contingent checked in at the
 * main counter (TeamEvent.attendedAt) — every member counts as present.
 * individual: attendance taken on the competition site, per participant
 * (TeamEventParticipantAttendance, the Kehadiran Individu page) — a member is
 * present when checked in individually, a team when at least one of its
 * members is, a contingent when at least one of its teams is. Managers follow
 * their contingent in both modes.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const individual = req.nextUrl.searchParams.get("mode") === "individual";

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      name: true,
      venue: true,
      address: true,
      city: true,
      latitude: true,
      longitude: true,
      state: { select: { name: true } },
    },
  });
  if (!event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });

  const teamEvents = await db.teamEvent.findMany({
    where: { ...onsiteOnly(eventId), eventId, acceptance: "ACCEPT", team: { status: "ACTIVE" } },
    select: {
      id: true,
      attendedAt: true,
      participantAttendance: { select: { participantId: true, attendedAt: true } },
      team: {
        select: {
          id: true,
          contingentId: true,
          members: { select: { participantId: true } },
          competition: {
            select: {
              targetGroups: {
                select: {
                  targetGroup: {
                    select: { id: true, name: true, schoolLevel: true, ageGroup: true },
                  },
                },
                take: 1,
              },
            },
          },
          contingent: {
            select: {
              id: true,
              name: true,
              managers: { select: { id: true } },
              school: {
                select: {
                  id:        true,
                  name:      true,
                  latitude:  true,
                  longitude: true,
                  state:    { select: { name: true } },
                  district: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  // ── Presence, by mode ─────────────────────────────────────────────────────
  type TE = (typeof teamEvents)[number];
  const checkedIn = new Map<string, Set<string>>(teamEvents.map(te => [te.id, new Set(te.participantAttendance.map(a => a.participantId))]));
  const teamPresent   = (te: TE) => individual ? (checkedIn.get(te.id)?.size ?? 0) > 0 : !!te.attendedAt;
  const memberPresent = (te: TE, pid: string) => individual ? !!checkedIn.get(te.id)?.has(pid) : !!te.attendedAt;

  // ── Overall stats ─────────────────────────────────────────────────────────

  const contingentMap = new Map<string, { present: boolean; managerIds: string[] }>();
  for (const te of teamEvents) {
    const cId = te.team.contingentId;
    const managerIds = te.team.contingent.managers.map((m) => m.id);
    const existing = contingentMap.get(cId);
    if (!existing) {
      contingentMap.set(cId, { present: teamPresent(te), managerIds });
    } else {
      if (teamPresent(te)) existing.present = true;
    }
  }

  const contingentEntries = [...contingentMap.entries()];
  const contingentsTotal   = contingentEntries.length;
  const contingentsPresent = contingentEntries.filter(([, v]) => v.present).length;

  const allManagerIds     = new Set<string>();
  const presentManagerIds = new Set<string>();
  for (const [, { present, managerIds }] of contingentEntries) {
    for (const mid of managerIds) {
      allManagerIds.add(mid);
      if (present) presentManagerIds.add(mid);
    }
  }

  const teamsTotal   = teamEvents.length;
  const teamsPresent = teamEvents.filter(teamPresent).length;

  const allPids     = new Set<string>();
  const presentPids = new Set<string>();
  for (const te of teamEvents) {
    for (const m of te.team.members) {
      allPids.add(m.participantId);
      if (memberPresent(te, m.participantId)) presentPids.add(m.participantId);
    }
  }
  const participantsTotal   = allPids.size;
  const participantsPresent = presentPids.size;

  // ── By target group ───────────────────────────────────────────────────────

  type TgAcc = {
    id: string; name: string; schoolLevel: string;
    contingentIds: Set<string>; presentContingentIds: Set<string>;
    managerIds: Set<string>; presentManagerIds: Set<string>;
    teamsTotal: number; teamsPresent: number;
    participantIds: Set<string>; presentParticipantIds: Set<string>;
  };

  const tgMap = new Map<string, TgAcc>();

  for (const te of teamEvents) {
    const tgRel = te.team.competition.targetGroups[0]?.targetGroup;
    if (!tgRel) continue;

    if (!tgMap.has(tgRel.id)) {
      tgMap.set(tgRel.id, {
        id: tgRel.id, name: tgRel.name, schoolLevel: tgRel.schoolLevel,
        contingentIds:        new Set(),
        presentContingentIds: new Set(),
        managerIds:           new Set(),
        presentManagerIds:    new Set(),
        teamsTotal: 0, teamsPresent: 0,
        participantIds:        new Set(),
        presentParticipantIds: new Set(),
      });
    }

    const g = tgMap.get(tgRel.id)!;
    const present = teamPresent(te);
    g.contingentIds.add(te.team.contingentId);
    if (present) g.presentContingentIds.add(te.team.contingentId);
    for (const m of te.team.contingent.managers) {
      g.managerIds.add(m.id);
      if (present) g.presentManagerIds.add(m.id);
    }
    g.teamsTotal++;
    if (present) g.teamsPresent++;
    for (const m of te.team.members) {
      g.participantIds.add(m.participantId);
      if (memberPresent(te, m.participantId)) g.presentParticipantIds.add(m.participantId);
    }
  }

  const byTargetGroup = [...tgMap.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((g) => ({
      id:          g.id,
      name:        g.name,
      schoolLevel: g.schoolLevel,
      contingents:  { total: g.contingentIds.size,        present: g.presentContingentIds.size },
      managers:     { total: g.managerIds.size,            present: g.presentManagerIds.size },
      teams:        { total: g.teamsTotal,                 present: g.teamsPresent },
      participants: { total: g.participantIds.size,          present: g.presentParticipantIds.size },
    }));

  // ── Contingent locations ──────────────────────────────────────────────────

  const seenContingents = new Set<string>();
  const contingentLocations: {
    contingentId: string; name: string;
    schoolId: string | null;
    schoolName: string | null; stateName: string | null; districtName: string | null;
    schoolLat: number | null; schoolLng: number | null;
    present: boolean;
  }[] = [];

  for (const te of teamEvents) {
    const c = te.team.contingent;
    if (seenContingents.has(c.id)) continue;
    seenContingents.add(c.id);
    contingentLocations.push({
      contingentId: c.id,
      name:         c.name,
      schoolId:     c.school?.id                ?? null,
      schoolName:   c.school?.name              ?? null,
      stateName:    c.school?.state?.name        ?? null,
      districtName: c.school?.district?.name     ?? null,
      schoolLat:    c.school?.latitude           ?? null,
      schoolLng:    c.school?.longitude          ?? null,
      present:      contingentMap.get(c.id)?.present ?? false,
    });
  }

  // Individual mode: how complete each team is, and when site check-ins happened.
  let checkIns = 0, teamsFull = 0, teamsPartial = 0;
  let first: Date | null = null, last: Date | null = null;
  if (individual)
    for (const te of teamEvents) {
      const n = te.team.members.length, k = te.team.members.filter(m => memberPresent(te, m.participantId)).length;
      if (n > 0 && k === n) teamsFull++;
      else if (k > 0) teamsPartial++;
      for (const a of te.participantAttendance) {
        checkIns++;
        if (!first || a.attendedAt < first) first = a.attendedAt;
        if (!last || a.attendedAt > last) last = a.attendedAt;
      }
    }

  return NextResponse.json({
    mode: individual ? "individual" : "counter",
    ...(individual && {
      individual: { checkIns, teamsFull, teamsPartial, firstCheckIn: first?.toISOString() ?? null, lastCheckIn: last?.toISOString() ?? null },
    }),
    event: {
      name:      event.name,
      venue:     event.venue,
      latitude:  event.latitude,
      longitude: event.longitude,
      stateName: event.state?.name ?? null,
    },
    overall: {
      contingents:  { total: contingentsTotal,    present: contingentsPresent },
      managers:     { total: allManagerIds.size,  present: presentManagerIds.size },
      teams:        { total: teamsTotal,           present: teamsPresent },
      participants: { total: participantsTotal,    present: participantsPresent },
    },
    byTargetGroup,
    contingentLocations,
  });
}
