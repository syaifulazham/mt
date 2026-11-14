import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { matchesTargetGroup } from "@/lib/targetGroupMatch";
import { loadEventCompetitions, loadForeignContingent, requireInternationalAdmin } from "@/lib/international";
import { currentInternationalLink } from "@/lib/international-link";

type Params = { params: Promise<{ id: string; cid: string }> };

/**
 * GET — One foreign school: participants, trainers, its teams in this event's
 * competitions (with this event's entry), and the event's competitions with
 * which participants are eligible for each (target groups).
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  const { id: eventId, cid } = await params;

  const found = await loadForeignContingent(cid);
  if ("error" in found) return found.error;

  const competitions = await loadEventCompetitions(eventId);
  if (!competitions) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });

  const [participants, trainers, teams] = await Promise.all([
    db.participant.findMany({
      where:   { contingentId: cid },
      select:  {
        id: true, name: true, passport: true, birthDate: true, gender: true, age: true,
        eduLevel: true, classGrade: true, email: true, phoneNumber: true, ppki: true,
        _count: { select: { teamMembers: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.trainer.findMany({
      where:   { contingentId: cid },
      select:  { id: true, name: true, passport: true, email: true, phoneNumber: true },
      orderBy: { name: "asc" },
    }),
    db.team.findMany({
      where:   { contingentId: cid, competitionId: { in: [...competitions.keys()] } },
      select:  {
        id: true, name: true, competitionId: true,
        members:    { select: { participant: { select: { id: true, name: true } } } },
        trainers:   { select: { trainer: { select: { id: true, name: true } } } },
        teamEvents: { select: { eventId: true, selected: true, acceptance: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Asia Spark Quizzly competitions: each one's stored quiz links, keyed by
  // participant. Organizers only — a registration link never sees codes.
  const quizzlyEcs = currentInternationalLink() ? [] : await db.eventCompetition.findMany({
    where: {
      eventId, parentId: null, competitionId: { in: [...competitions.keys()] },
      competition: { thirdPartyIntegration: "asiaspark-quizzly" },
    },
    select: { id: true, competitionId: true },
  });
  const quizzlyTokens = quizzlyEcs.length && participants.length ? await db.participantQuizzlyToken.findMany({
    where: { eventCompetitionId: { in: quizzlyEcs.map((e) => e.id) }, participantId: { in: participants.map((p) => p.id) } },
    select: { participantId: true, eventCompetitionId: true, token: true, startUrl: true, quizTitle: true, expiresAt: true },
  }) : [];
  const quizzlyByComp = new Map(quizzlyEcs.map((e) => [e.competitionId, e.id]));

  return NextResponse.json({
    data: {
      contingent: found.contingent,
      participants: participants.map(({ _count, birthDate, ...p }) => ({
        ...p,
        birthDate: birthDate ? birthDate.toISOString().slice(0, 10) : null,
        teamCount: _count.teamMembers,
      })),
      trainers,
      teams: teams.map((t) => {
        const entry = t.teamEvents.find((te) => te.eventId === eventId) ?? null;
        return {
          id: t.id, name: t.name, competitionId: t.competitionId,
          members:  t.members.map((m) => m.participant),
          trainers: t.trainers.map((x) => x.trainer),
          entry:    entry && { acceptance: entry.acceptance, selected: entry.selected },
          locked:   t.teamEvents.some((te) => te.selected),
        };
      }),
      competitions: [...competitions.values()].map((c) => {
        const groups = c.targetGroups.map((tg) => tg.targetGroup);
        return {
          id: c.id, code: c.code, name: c.name, participationType: c.participationType,
          minTeamSize: c.minTeamSize, maxTeamSize: c.maxTeamSize,
          quizzly: quizzlyByComp.has(c.id),
          quizLinks: Object.fromEntries(quizzlyTokens
            .filter((t) => t.eventCompetitionId === quizzlyByComp.get(c.id))
            .map((t) => [t.participantId, {
              token: t.token, startUrl: t.startUrl, quizTitle: t.quizTitle, expiresAt: t.expiresAt?.toISOString() ?? null,
            }])),
          eligibleParticipantIds: participants
            .filter((p) => groups.length === 0 || groups.some((g) => matchesTargetGroup(p, g)))
            .map((p) => p.id),
        };
      }),
    },
  });
}

/** PATCH { name?, shortName? } — rename the school. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  const { cid } = await params;

  const found = await loadForeignContingent(cid);
  if ("error" in found) return found.error;

  const body = await req.json().catch(() => null);
  const data: { name?: string; shortName?: string | null } = {};
  if (typeof body?.name === "string") {
    if (!body.name.trim()) return NextResponse.json({ error: "MISSING_NAME" }, { status: 400 });
    data.name = body.name.trim();
  }
  if (body && "shortName" in body)
    data.shortName = typeof body.shortName === "string" && body.shortName.trim() ? body.shortName.trim() : null;

  const updated = await db.contingent.update({
    where:  { id: cid },
    data,
    select: { id: true, name: true, shortName: true, countryId: true },
  });
  return NextResponse.json({ data: updated });
}

/** DELETE — remove an empty school (no participants, teams or trainers). */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  const { cid } = await params;

  const found = await loadForeignContingent(cid);
  if ("error" in found) return found.error;

  const counts = await db.contingent.findUnique({
    where:  { id: cid },
    select: { _count: { select: { participants: true, teams: true, trainers: true, managers: true } } },
  });
  const c = counts?._count;
  if (c && (c.participants || c.teams || c.trainers || c.managers))
    return NextResponse.json({ error: "CONTINGENT_NOT_EMPTY" }, { status: 400 });

  await db.contingent.delete({ where: { id: cid } });
  return NextResponse.json({ ok: true });
}
