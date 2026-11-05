import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isValidSlotScheduleConfig } from "@/lib/walkin-slots";
import {
  cleanIc, IC_RE, parseTeamMembers, registrationHasIc, submissionHasIc, teamSizeBounds,
  type WalkInTeamMember,
} from "@/lib/walkin-team";

/**
 * Creates a walk-in form submission: the public borang (`/borang/<slug>`) and,
 * for TEAM competitions, the participant portal dashboard both land here, so
 * every entry waits for the organizer's "Proses Borang" verification.
 *
 * TEAM competitions carry a temporary team (name + members' name/IC); the first
 * member stands in as the submission's own IC/name. INDIVIDUAL competitions
 * take one IC/name. Returns the HTTP status and JSON body for the caller.
 */
export async function createWalkInSubmission(input: {
  /** The borang endpoint; null when submitted from the portal dashboard. */
  endpointId: string | null;
  eventId: string;
  uniqueParticipation: boolean;
  walkInCompetitionId: string;
  body: Record<string, unknown>;
  /** Portal: the logged-in participant's IC, which must be on the team (it is moved to first place). */
  selfIc?: string;
}): Promise<{ status: number; json: Record<string, unknown> }> {
  const { body, eventId } = input;
  const fail = (status: number, error: string) => ({ status, json: { error } });

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: input.walkInCompetitionId, eventId },
    select: {
      id: true, walkInSlotSchedule: true,
      competition: { select: { participationType: true, minTeamSize: true, maxTeamSize: true } },
    },
  });
  if (!wic) return fail(404, "COMPETITION_NOT_FOUND");

  const isTeam = wic.competition.participationType === "TEAM";
  let team: { name: string; members: WalkInTeamMember[] } | null = null;
  let ic: string;
  let name: string;
  if (isTeam) {
    const teamName = typeof body.teamName === "string" ? body.teamName.trim() : "";
    if (teamName.length < 2) return fail(400, "INVALID_TEAM_NAME");
    const parsed = parseTeamMembers(body.members, teamSizeBounds(wic.competition));
    if ("error" in parsed) return fail(400, parsed.error);
    let members = parsed.members;
    if (input.selfIc) {
      const self = members.find((m) => m.ic === input.selfIc);
      if (!self) return fail(400, "SELF_NOT_IN_TEAM");
      members = [self, ...members.filter((m) => m !== self)];
    }
    team = { name: teamName, members };
    ({ ic, name } = members[0]);
  } else {
    ic = cleanIc(body.ic);
    if (!IC_RE.test(ic)) return fail(400, "INVALID_IC");
    if (typeof body.name !== "string" || body.name.trim().length < 3) return fail(400, "INVALID_NAME");
    name = body.name.trim().toUpperCase();
  }
  const ics = team ? team.members.map((m) => m.ic) : [ic];

  // One active submission per IC + competition (NO_MATCH does not block
  // re-submission). For teams this holds for every member; a registration
  // already held by a member (directly or through a team) blocks too.
  const [dup, held] = await Promise.all([
    db.walkInFormSubmission.findFirst({
      where: { walkInCompetitionId: wic.id, status: { in: ["PENDING", "PROCESSED"] }, OR: ics.map(submissionHasIc) },
      select: { id: true },
    }),
    db.walkInRegistration.findFirst({
      where: { walkInCompetitionId: wic.id, status: { in: ["PENDING", "CONFIRMED"] }, OR: ics.map(registrationHasIc) },
      select: { id: true },
    }),
  ]);
  if (dup) return fail(409, "DUPLICATE_SUBMISSION");
  if (held) return fail(409, "ALREADY_REGISTERED");

  // Penyertaan Unik: one submission/registration per IC per event (across all competitions)
  if (input.uniqueParticipation) {
    const [existingSub, existingReg] = await Promise.all([
      db.walkInFormSubmission.findFirst({
        where: {
          status: { in: ["PENDING", "PROCESSED"] },
          walkInCompetition: { eventId },
          OR: ics.map(submissionHasIc),
        },
        select: { id: true },
      }),
      db.walkInRegistration.findFirst({
        where: {
          status: { in: ["PENDING", "CONFIRMED"] },
          walkInCompetition: { eventId },
          OR: ics.map(registrationHasIc),
        },
        select: { id: true },
      }),
    ]);
    if (existingSub || existingReg) return fail(409, "UNIQUE_PARTICIPATION");
  }

  // Slot selection required when a slot schedule is configured
  const { sessionNumber, slotNumber } = body as { sessionNumber?: unknown; slotNumber?: unknown };
  const scheduleCfg = isValidSlotScheduleConfig(wic.walkInSlotSchedule) ? wic.walkInSlotSchedule : null;
  let slot: { sessionNumber: number; slotNumber: number } | null = null;
  if (scheduleCfg) {
    const s = Number.isInteger(sessionNumber) ? (sessionNumber as number) : 0;
    const n = Number.isInteger(slotNumber) ? (slotNumber as number) : 0;
    if (s < 1 || s > scheduleCfg.totalSessions || n < 1 || n > scheduleCfg.slotsPerSession)
      return fail(400, "SLOT_REQUIRED");
    slot = { sessionNumber: s, slotNumber: n };

    const [takenReg, takenSub] = await Promise.all([
      db.walkInRegistration.findFirst({
        where: { walkInCompetitionId: wic.id, ...slot, status: { in: ["PENDING", "CONFIRMED"] } },
        select: { id: true },
      }),
      db.walkInFormSubmission.findFirst({
        where: { walkInCompetitionId: wic.id, ...slot, status: "PENDING" },
        select: { id: true },
      }),
    ]);
    if (takenReg || takenSub) return fail(409, "SLOT_TAKEN");
  }

  const schoolName = typeof body.schoolName === "string" && body.schoolName.trim() ? body.schoolName.trim() : null;
  try {
    const sub = await db.walkInFormSubmission.create({
      data: {
        endpointId: input.endpointId,
        walkInCompetitionId: wic.id,
        ic,
        name,
        ...(team && { teamName: team.name, teamMembers: team.members }),
        schoolName,
        ...slot,
      },
      select: { id: true, status: true, sessionNumber: true, slotNumber: true },
    });
    return { status: 201, json: { data: sub } };
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target as string[] | undefined) ?? [];
      return fail(409, target.includes("sessionNumber") ? "SLOT_TAKEN" : "DUPLICATE_SUBMISSION");
    }
    throw e;
  }
}
