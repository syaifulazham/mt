import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { checkTeamPeople } from "@/lib/international";
import { cleanIc, IC_RE, readTeamMembers, registrationHasIc, submissionHasIc, teamSizeBounds } from "@/lib/walkin-team";

/**
 * A participant adds a member to their team entry for a walk-in competition,
 * from the portal dashboard, at any time after registering:
 * - a team entry still awaiting verification (form submission): the member
 *   (IC + name) is appended to the temporary team;
 * - a verified team registration: the IC must be an active participant of the
 *   team's contingent who is eligible for the competition; they join the team.
 * Either way the team stays within the competition's maximum size, and the new
 * member may not already hold this walk-in competition (or, with Penyertaan
 * Unik, any walk-in competition of the event).
 */
type Fail = { error: string; detail?: string; status: number };
type Ok = { members: string[] };

const ACTIVE_REG = { in: ["PENDING", "CONFIRMED"] as ("PENDING" | "CONFIRMED")[] };

const COMPETITION_SELECT = {
  id: true, code: true, name: true, participationType: true, minTeamSize: true, maxTeamSize: true,
  targetGroups: {
    select: { targetGroup: { select: { schoolLevel: true, ppki: true, classGrades: true, minAge: true, maxAge: true } } },
  },
} as const;

/** Does this IC already hold the walk-in competition (or, with Penyertaan Unik, any of the event)? */
async function icHeld(ic: string, wicId: string, eventId: string, unique: boolean) {
  const scope = unique ? { walkInCompetition: { eventId } } : { walkInCompetitionId: wicId };
  const [reg, sub] = await Promise.all([
    db.walkInRegistration.findFirst({ where: { ...scope, status: ACTIVE_REG, ...registrationHasIc(ic) }, select: { id: true } }),
    db.walkInFormSubmission.findFirst({ where: { ...scope, status: { in: ["PENDING", "PROCESSED"] }, ...submissionHasIc(ic) }, select: { id: true } }),
  ]);
  return Boolean(reg || sub);
}

export async function addWalkInTeamMember(input: {
  selfParticipantId: string; selfIc: string; walkInCompetitionId: string; ic: unknown; name: unknown;
}): Promise<Ok | Fail> {
  const ic = cleanIc(input.ic);
  if (!IC_RE.test(ic)) return { error: "INVALID_IC", status: 400 };

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: input.walkInCompetitionId },
    select: {
      id: true, eventId: true, publishToPortal: true,
      event: { select: { walkInUniqueParticipation: true } },
      competition: { select: COMPETITION_SELECT },
    },
  });
  if (!wic || !wic.publishToPortal) return { error: "NOT_FOUND", status: 404 };
  if (wic.competition.participationType !== "TEAM") return { error: "NOT_A_TEAM_COMPETITION", status: 400 };
  const { max } = teamSizeBounds(wic.competition);
  const unique = wic.event.walkInUniqueParticipation;

  // ── Verified team registration ──
  const reg = await db.walkInRegistration.findFirst({
    where: {
      walkInCompetitionId: wic.id, status: ACTIVE_REG, teamId: { not: null },
      OR: [
        { team: { members: { some: { participantId: input.selfParticipantId } } } },
        ...(input.selfIc ? [registrationHasIc(input.selfIc)] : []),
      ],
    },
    select: {
      team: { select: { id: true, contingentId: true, members: { select: { participantId: true, participant: { select: { ic: true } } } } } },
    },
  });
  if (reg?.team) {
    const team = reg.team;
    if (team.members.some((m) => cleanIc(m.participant.ic) === ic)) return { error: "ALREADY_IN_TEAM", status: 409 };
    if (team.members.length >= max) return { error: "TEAM_FULL", status: 409 };
    const person = await db.participant.findFirst({
      where: { ic, status: "ACTIVE" },
      select: { id: true, name: true, contingentId: true },
    });
    if (!person) return { error: "MEMBER_NOT_FOUND", status: 404 };
    if (person.contingentId !== team.contingentId) return { error: "MEMBER_NOT_IN_CONTINGENT", status: 409 };
    if (await icHeld(ic, wic.id, wic.eventId, unique)) return { error: "ALREADY_REGISTERED", detail: person.name, status: 409 };
    const problem = await checkTeamPeople({
      contingentId: team.contingentId, competition: wic.competition,
      memberIds: [...team.members.map((m) => m.participantId), person.id], trainerIds: [],
      eventId: wic.eventId, exceptTeamId: team.id,
    });
    if (problem) return { ...problem, status: 409 };
    try {
      await db.teamMember.create({ data: { teamId: team.id, participantId: person.id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "ALREADY_IN_TEAM", status: 409 };
      throw e;
    }
    const members = await db.teamMember.findMany({
      where: { teamId: team.id }, orderBy: { createdAt: "asc" }, select: { participant: { select: { name: true } } },
    });
    return { members: members.map((m) => m.participant.name) };
  }

  // ── Team entry awaiting verification ──
  if (!input.selfIc) return { error: "NOT_REGISTERED", status: 404 };
  const sub = await db.walkInFormSubmission.findFirst({
    where: { walkInCompetitionId: wic.id, status: "PENDING", teamName: { not: null }, ...submissionHasIc(input.selfIc) },
    select: { id: true, teamMembers: true },
  });
  if (!sub) return { error: "NOT_REGISTERED", status: 404 };
  const name = typeof input.name === "string" ? input.name.trim().toUpperCase() : "";
  if (name.length < 3) return { error: "INVALID_NAME", status: 400 };
  const current = readTeamMembers(sub.teamMembers);
  if (current.some((m) => m.ic === ic)) return { error: "ALREADY_IN_TEAM", status: 409 };
  if (current.length >= max) return { error: "TEAM_FULL", status: 409 };
  if (await icHeld(ic, wic.id, wic.eventId, unique)) return { error: "ALREADY_REGISTERED", detail: name, status: 409 };

  const next = [...current, { ic, name }];
  // Only update if the list is unchanged since it was read (two quick adds cannot overwrite each other).
  const { count } = await db.walkInFormSubmission.updateMany({
    where: { id: sub.id, status: "PENDING", teamMembers: { equals: sub.teamMembers as Prisma.InputJsonValue } },
    data: { teamMembers: next },
  });
  if (count === 0) return { error: "CHANGED", status: 409 };
  return { members: next.map((m) => m.name) };
}
