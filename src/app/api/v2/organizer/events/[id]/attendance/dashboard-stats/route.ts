import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;

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
    where: { eventId, acceptance: "ACCEPT" },
    select: {
      id: true,
      attendedAt: true,
      team: {
        select: {
          id: true,
          contingentId: true,
          members: { select: { id: true } },
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

  // ── Overall stats ─────────────────────────────────────────────────────────

  const contingentMap = new Map<string, { present: boolean; managerIds: string[] }>();
  for (const te of teamEvents) {
    const cId = te.team.contingentId;
    const managerIds = te.team.contingent.managers.map((m) => m.id);
    const existing = contingentMap.get(cId);
    if (!existing) {
      contingentMap.set(cId, { present: !!te.attendedAt, managerIds });
    } else {
      if (te.attendedAt) existing.present = true;
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

  const teamsTotal     = teamEvents.length;
  const teamsPresent   = teamEvents.filter((te) => te.attendedAt).length;
  const participantsTotal   = teamEvents.reduce((s, te) => s + te.team.members.length, 0);
  const participantsPresent = teamEvents
    .filter((te) => te.attendedAt)
    .reduce((s, te) => s + te.team.members.length, 0);

  // ── By target group ───────────────────────────────────────────────────────

  type TgAcc = {
    id: string; name: string; schoolLevel: string;
    contingentIds: Set<string>; presentContingentIds: Set<string>;
    managerIds: Set<string>; presentManagerIds: Set<string>;
    teamsTotal: number; teamsPresent: number;
    participantsTotal: number; participantsPresent: number;
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
        participantsTotal: 0, participantsPresent: 0,
      });
    }

    const g = tgMap.get(tgRel.id)!;
    g.contingentIds.add(te.team.contingentId);
    if (te.attendedAt) g.presentContingentIds.add(te.team.contingentId);
    for (const m of te.team.contingent.managers) {
      g.managerIds.add(m.id);
      if (te.attendedAt) g.presentManagerIds.add(m.id);
    }
    g.teamsTotal++;
    if (te.attendedAt) g.teamsPresent++;
    g.participantsTotal   += te.team.members.length;
    if (te.attendedAt) g.participantsPresent += te.team.members.length;
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
      participants: { total: g.participantsTotal,          present: g.participantsPresent },
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

  return NextResponse.json({
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
