import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isValidSlotScheduleConfig } from "@/lib/walkin-slots";
import { claimSlot, isSlotConflict, slotDatesOf } from "@/lib/walkin-slot-server";
import { createWalkInSubmission } from "@/lib/walkin-submission";
import { confirmTeamVerification, loadTeamSubmission, previewTeamVerification } from "@/lib/walkin-team-verify";
import { cleanIc, IC_RE, readTeamMembers, teamSizeBounds } from "@/lib/walkin-team";
import {
  vibeBlocksConfigured, vibeBlocksRegisterFreshEntry, encodeVibeBlocksToken, parseVibeBlocksToken,
} from "@/lib/vibeblocks";
import { asGameProvider, gameLabel } from "@/lib/game-provider";

/**
 * Team competitions at the walk-in counter (/walkin/<slug>). The counter can:
 * - verify a pending team entry (borang or portal) — the same check as the
 *   organizer's "Proses Borang", anchored on the first member found by IC;
 * - register a team that already exists in the main data;
 * - register a new team on the spot from members' ICs (stored as a submission
 *   and verified at once, so it leaves the same trail as a borang entry).
 * A team holds one registration, anchored on one member.
 */

const mask = (ic: string | null) => (ic ? `****${ic.slice(-4)}` : null);

export type CounterWic = NonNullable<Awaited<ReturnType<typeof loadCounterWic>>>;

export async function loadCounterWic(eventId: string, wicId: string) {
  return db.eventWalkInCompetition.findUnique({
    where: { id: wicId, eventId },
    select: {
      id: true, maxSlots: true, walkInSlotSchedule: true, useVibeblocks: true, vibeBlocksProvider: true, viblockChallengeId: true,
      event: { select: { walkInUniqueParticipation: true, startDate: true, endDate: true } },
      competition: { select: { id: true, participationType: true, minTeamSize: true, maxTeamSize: true } },
      _count: { select: { registrations: true } },
    },
  });
}

/** The entry token to show for a stored VibeBlocks composite token. */
function shownToken(wic: { useVibeblocks: boolean }, stored: string | null) {
  if (!wic.useVibeblocks || !stored) return null;
  return parseVibeBlocksToken(stored)?.entryToken ?? null;
}

/** Registers the team's entry with VibeBlocks when the competition is linked. Never throws. */
async function issueVibeBlocks(wic: CounterWic, regId: string): Promise<string | null> {
  const gp = asGameProvider(wic.vibeBlocksProvider);
  if (!wic.useVibeblocks || !wic.viblockChallengeId || !vibeBlocksConfigured(gp)) return null;
  try {
    const v = await vibeBlocksRegisterFreshEntry(wic.viblockChallengeId, {
      walkInCompetitionId: wic.id, partnerReference: regId, provider: gp,
    });
    await db.walkInRegistration.update({
      where: { id: regId }, data: { viblockToken: encodeVibeBlocksToken(v.entryToken, v.entry_id) },
    });
    return v.entryToken;
  } catch (e) {
    // The registration stands; the organizer can register the token later.
    console.error(`[${gp}] counter team entry failed:`, e);
    return null;
  }
}

/* ─── Search ──────────────────────────────────────────────────────────── */

export async function searchCounterTeams(eventId: string, wic: CounterWic, q: string) {
  const qClean = cleanIc(q);
  const icLike = /^\d{4,12}$/.test(qClean);

  const [subs, teams] = await Promise.all([
    db.walkInFormSubmission.findMany({
      where: {
        walkInCompetitionId: wic.id,
        status: "PENDING",
        teamName: { not: null },
        OR: [
          { teamName: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          ...(icLike ? [{ ic: { contains: qClean } }] : []),
          ...(IC_RE.test(qClean) ? [{ teamMembers: { array_contains: [{ ic: qClean }] } }] : []),
        ],
      },
      take: 10,
      orderBy: { createdAt: "asc" },
      select: {
        id: true, teamName: true, teamMembers: true, schoolName: true,
        slotDate: true, sessionNumber: true, slotNumber: true, endpointId: true,
      },
    }),
    db.team.findMany({
      where: {
        competitionId: wic.competition.id,
        status: "ACTIVE",
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { members: { some: { participant: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              ...(icLike ? [{ ic: { contains: qClean } }] : []),
            ],
          } } } },
        ],
      },
      take: 15,
      orderBy: { name: "asc" },
      select: {
        id: true, name: true,
        contingent: { select: { name: true, shortName: true } },
        members: { select: { participant: { select: { id: true, name: true, ic: true } } }, orderBy: { createdAt: "asc" } },
        walkInRegistrations: {
          where: { walkInCompetitionId: wic.id, status: { in: ["PENDING", "CONFIRMED"] } },
          select: { id: true, status: true, slotDate: true, sessionNumber: true, slotNumber: true, viblockToken: true },
          take: 1,
        },
      },
    }),
  ]);

  return {
    submissions: subs.map((s) => ({
      id: s.id,
      teamName: s.teamName ?? "",
      schoolName: s.schoolName,
      source: s.endpointId ? "BORANG" : "PORTAL",
      slotDate: s.slotDate, sessionNumber: s.sessionNumber, slotNumber: s.slotNumber,
      members: readTeamMembers(s.teamMembers).map((m) => ({ name: m.name, ic: mask(m.ic) })),
    })),
    teams: teams.map((t) => {
      const reg = t.walkInRegistrations[0] ?? null;
      return {
        id: t.id, name: t.name,
        contingentName: t.contingent.shortName ?? t.contingent.name,
        members: t.members.map((m) => ({ id: m.participant.id, name: m.participant.name, ic: mask(m.participant.ic) })),
        registration: reg && {
          id: reg.id, status: reg.status, slotDate: reg.slotDate, sessionNumber: reg.sessionNumber, slotNumber: reg.slotNumber,
          vibeBlocksToken: shownToken(wic, reg.viblockToken),
        },
      };
    }),
  };
}

/* ─── Results ─────────────────────────────────────────────────────────── */

export type TeamRegResult = {
  registrationId: string; teamName: string; contingentName: string;
  members: string[]; slotDate: string; sessionNumber: number | null; slotNumber: number | null;
  vibeBlocksToken: string | null;
  gameName: string | null;
};

async function teamRegResult(regId: string, vibeBlocksToken: string | null): Promise<TeamRegResult> {
  const reg = await db.walkInRegistration.findUniqueOrThrow({
    where: { id: regId },
    select: {
      slotDate: true, sessionNumber: true, slotNumber: true,
      walkInCompetition: { select: { useVibeblocks: true, vibeBlocksProvider: true } },
      contingent: { select: { name: true } },
      team: { select: { name: true, members: { select: { participant: { select: { name: true } } }, orderBy: { createdAt: "asc" } } } },
    },
  });
  return {
    registrationId: regId,
    teamName: reg.team?.name ?? "",
    contingentName: reg.contingent.name,
    members: reg.team?.members.map((m) => m.participant.name) ?? [],
    slotDate: reg.slotDate, sessionNumber: reg.sessionNumber, slotNumber: reg.slotNumber,
    vibeBlocksToken,
    gameName: reg.walkInCompetition.useVibeblocks ? gameLabel(reg.walkInCompetition.vibeBlocksProvider) : null,
  };
}

type Fail = { error: string; detail?: string; status: number };

/* ─── Pending team entries ────────────────────────────────────────────── */

/** First borang member whose IC is an active participant — the counter's anchor. */
async function autoAnchor(subTeamMembers: Prisma.JsonValue | null) {
  const ics = readTeamMembers(subTeamMembers).map((m) => m.ic);
  if (ics.length === 0) return null;
  const found = await db.participant.findMany({
    where: { ic: { in: ics }, status: "ACTIVE" }, select: { id: true, ic: true },
  });
  for (const ic of ics) {
    const p = found.find((f) => f.ic === ic);
    if (p) return p.id;
  }
  return null;
}

export async function previewCounterSubmission(eventId: string, wic: CounterWic, subId: string) {
  const sub = await loadTeamSubmission(eventId, subId);
  if (!sub || sub.walkInCompetitionId !== wic.id || !sub.teamName) return { error: "NOT_FOUND", status: 404 } as Fail;
  if (sub.status !== "PENDING") return { error: "ALREADY_PROCESSED", status: 409 } as Fail;
  const anchorId = await autoAnchor(sub.teamMembers);
  if (!anchorId) return { error: "NO_MEMBER_FOUND", status: 409 } as Fail;
  const preview = await previewTeamVerification(sub, anchorId);
  if ("notFound" in preview) return { error: "NO_MEMBER_FOUND", status: 409 } as Fail;
  return { preview };
}

export async function confirmCounterSubmission(eventId: string, wic: CounterWic, subId: string) {
  const sub = await loadTeamSubmission(eventId, subId);
  if (!sub || sub.walkInCompetitionId !== wic.id || !sub.teamName) return { error: "NOT_FOUND", status: 404 } as Fail;
  const anchorId = await autoAnchor(sub.teamMembers);
  if (!anchorId) return { error: "NO_MEMBER_FOUND", status: 409 } as Fail;
  const r = await confirmTeamVerification(eventId, subId, anchorId);
  if ("error" in r) return r as Fail;
  return { result: await teamRegResult(r.registrationId, await issueVibeBlocks(wic, r.registrationId)) };
}

/* ─── Slot checks shared by the two direct registrations ─────────────── */

export type SlotInput = { sessionNumber?: unknown; slotNumber?: unknown; slotDate?: unknown };

function checkSlot(wic: CounterWic, input: SlotInput) {
  const cfg = isValidSlotScheduleConfig(wic.walkInSlotSchedule) ? wic.walkInSlotSchedule : null;
  return claimSlot(wic.id, cfg, slotDatesOf(wic.event, cfg), input);
}

/* ─── Existing team ───────────────────────────────────────────────────── */

export async function registerExistingTeam(
  eventId: string, wic: CounterWic, teamId: string, slotInput: SlotInput,
): Promise<{ result: TeamRegResult } | Fail> {
  if (wic.maxSlots > 0 && wic._count.registrations >= wic.maxSlots) return { error: "SLOTS_FULL", status: 409 };
  const team = await db.team.findFirst({
    where: { id: teamId, competitionId: wic.competition.id },
    select: { id: true, contingentId: true, members: { select: { participantId: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!team) return { error: "TEAM_NOT_FOUND", status: 404 };
  if (team.members.length === 0) return { error: "EXISTING_TEAM_EMPTY", status: 409 };

  const slotCheck = await checkSlot(wic, slotInput);
  if ("error" in slotCheck) return slotCheck;

  // Nobody on the team may already hold this walk-in competition (or, with
  // Penyertaan Unik, any walk-in competition of the event).
  const ids = team.members.map((m) => m.participantId);
  const held = await db.walkInRegistration.findFirst({
    where: {
      status: { in: ["PENDING", "CONFIRMED"] },
      ...(wic.event.walkInUniqueParticipation ? { walkInCompetition: { eventId } } : { walkInCompetitionId: wic.id }),
      OR: [
        { teamId: team.id },
        { participantId: { in: ids } },
        { team: { members: { some: { participantId: { in: ids } } } } },
      ],
    },
    select: { walkInCompetitionId: true, teamId: true, participant: { select: { name: true } }, team: { select: { name: true } } },
  });
  if (held) {
    if (held.teamId === team.id && held.walkInCompetitionId === wic.id) return { error: "TEAM_ALREADY_REGISTERED", status: 409 };
    return {
      error: held.walkInCompetitionId === wic.id ? "ALREADY_REGISTERED" : "UNIQUE_PARTICIPATION",
      detail: held.team?.name ?? held.participant.name, status: 409,
    };
  }

  try {
    const reg = await db.$transaction(async (tx) => {
      await tx.teamEvent.upsert({
        where: { teamId_eventId: { teamId: team.id, eventId } },
        create: { teamId: team.id, eventId, acceptance: "ACCEPT" },
        update: { acceptance: "ACCEPT" },
      });
      return tx.walkInRegistration.create({
        data: {
          walkInCompetitionId: wic.id,
          participantId: ids[0],
          contingentId: team.contingentId,
          teamId: team.id,
          status: "CONFIRMED",
          method: "COUNTER",
          confirmedAt: new Date(),
          ...slotCheck.slot,
        },
        select: { id: true },
      });
    });
    return { result: await teamRegResult(reg.id, await issueVibeBlocks(wic, reg.id)) };
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { error: isSlotConflict(e) ? "SLOT_TAKEN" : "ALREADY_REGISTERED", status: 409 };
    throw e;
  }
}

/* ─── New team on the spot ────────────────────────────────────────────── */

export async function registerNewTeam(
  eventId: string, wic: CounterWic,
  input: { teamName: unknown; ics: unknown } & SlotInput,
): Promise<{ result: TeamRegResult } | Fail> {
  if (wic.maxSlots > 0 && wic._count.registrations >= wic.maxSlots) return { error: "SLOTS_FULL", status: 409 };
  const teamName = typeof input.teamName === "string" ? input.teamName.trim() : "";
  if (teamName.length < 2) return { error: "INVALID_TEAM_NAME", status: 400 };
  const ics = Array.isArray(input.ics) ? input.ics.map(cleanIc).filter(Boolean) : [];
  const bad = ics.find((ic) => !IC_RE.test(ic));
  if (bad) return { error: "INVALID_MEMBERS", detail: bad, status: 400 };
  if (new Set(ics).size !== ics.length) return { error: "DUPLICATE_MEMBER_IC", status: 400 };
  const { min, max } = teamSizeBounds(wic.competition);
  if (ics.length < min || ics.length > max) return { error: "TEAM_SIZE", detail: `${min}–${max}`, status: 400 };

  // Every member must be a participant, all from one contingent.
  const found = await db.participant.findMany({
    where: { ic: { in: ics }, status: "ACTIVE" },
    select: { id: true, name: true, ic: true, contingentId: true, contingent: { select: { name: true } } },
  });
  const people = [];
  for (const ic of ics) {
    const p = found.find((f) => f.ic === ic);
    if (!p) return { error: "MEMBER_NOT_FOUND", detail: ic, status: 409 };
    people.push(p);
  }
  if (new Set(people.map((p) => p.contingentId)).size > 1) return { error: "MIXED_CONTINGENT", status: 409 };

  const created = await createWalkInSubmission({
    endpointId: null,
    eventId,
    uniqueParticipation: wic.event.walkInUniqueParticipation,
    walkInCompetitionId: wic.id,
    body: {
      teamName,
      members: people.map((p) => ({ ic: p.ic, name: p.name })),
      schoolName: people[0].contingent.name,
      sessionNumber: input.sessionNumber, slotNumber: input.slotNumber, slotDate: input.slotDate,
    },
  });
  const subId = (created.json.data as { id?: string } | undefined)?.id;
  if (created.status !== 201 || !subId) return { error: String(created.json.error ?? "FAILED"), status: created.status };

  const r = await confirmTeamVerification(eventId, subId, people[0].id);
  if ("error" in r) {
    // Made in this request only to be verified; drop it so it holds no slot.
    await db.walkInFormSubmission.delete({ where: { id: subId } }).catch(() => null);
    return r;
  }
  return { result: await teamRegResult(r.registrationId, await issueVibeBlocks(wic, r.registrationId)) };
}
