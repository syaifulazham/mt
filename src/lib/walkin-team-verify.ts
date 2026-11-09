import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { checkTeamPeople } from "@/lib/international";
import { readTeamMembers, teamSizeBounds } from "@/lib/walkin-team";
import { heldSlot, isSlotConflict, slotTaken } from "@/lib/walkin-slot-server";

/**
 * Verifying a walk-in borang's temporary team against the main data.
 *
 * The organizer picks one participant (searched by a member's IC). That
 * participant's contingent becomes the team's contingent. Borang members are
 * matched by IC inside that contingent; the rest are dropped. If the contingent
 * already has a team with the same name (trimmed, case-insensitive) in this
 * competition, that team is linked as it is; otherwise a new team is made of
 * the matched members. Either way the walk-in gets one registration per team.
 *
 * `previewTeamVerification` is read-only; `confirmTeamVerification` runs it
 * again before writing, so the client's copy of the preview is never trusted.
 */

export type MemberMatch = {
  ic: string;
  name: string;
  status: "MATCHED" | "NOT_FOUND" | "OTHER_CONTINGENT";
  participant?: { id: string; name: string };
  otherContingentName?: string;
};

export type TeamPreview = {
  contingent: { id: string; name: string };
  anchor: { id: string; name: string };
  teamName: string;
  members: MemberMatch[];
  /** Picked by the organizer but not on the borang's member list (e.g. IC typo). */
  anchorAddedFromSearch: boolean;
  outcome: "LINK_EXISTING" | "CREATE_TEAM";
  existingTeam: { id: string; name: string; members: { id: string; name: string }[] } | null;
  /** Participants the resulting team will hold. */
  finalMembers: { id: string; name: string }[];
  /** Blocking problem; confirm is refused while set. */
  error: { code: string; detail?: string } | null;
};

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export async function loadTeamSubmission(eventId: string, subId: string) {
  return db.walkInFormSubmission.findFirst({
    where: { id: subId, walkInCompetition: { eventId } },
    select: {
      id: true, status: true, walkInCompetitionId: true,
      slotDate: true, sessionNumber: true, slotNumber: true,
      teamName: true, teamMembers: true,
      walkInCompetition: {
        select: {
          eventId: true,
          event: { select: { walkInUniqueParticipation: true } },
          competition: {
            select: {
              id: true, code: true, name: true, participationType: true, minTeamSize: true, maxTeamSize: true,
              targetGroups: {
                select: { targetGroup: { select: { schoolLevel: true, ppki: true, classGrades: true, minAge: true, maxAge: true } } },
              },
            },
          },
        },
      },
    },
  });
}

type TeamSubmission = NonNullable<Awaited<ReturnType<typeof loadTeamSubmission>>>;

export async function previewTeamVerification(
  sub: TeamSubmission,
  participantId: string,
): Promise<TeamPreview | { notFound: true }> {
  const wic = sub.walkInCompetition;
  const competition = wic.competition;
  const eventId = wic.eventId;

  const picked = await db.participant.findUnique({
    where: { id: participantId },
    select: { id: true, name: true, ic: true, contingent: { select: { id: true, name: true } } },
  });
  if (!picked) return { notFound: true };
  const contingent = picked.contingent;

  // ── Match borang members by IC, inside the picked participant's contingent ──
  const borang = readTeamMembers(sub.teamMembers);
  const found = await db.participant.findMany({
    where: { ic: { in: borang.map((m) => m.ic) }, status: "ACTIVE" },
    select: { id: true, name: true, ic: true, contingentId: true, contingent: { select: { name: true } } },
  });
  const members: MemberMatch[] = borang.map((m) => {
    const same = found.find((p) => p.ic === m.ic && p.contingentId === contingent.id);
    if (same) return { ...m, status: "MATCHED", participant: { id: same.id, name: same.name } };
    const other = found.find((p) => p.ic === m.ic);
    if (other) return { ...m, status: "OTHER_CONTINGENT", otherContingentName: other.contingent.name };
    return { ...m, status: "NOT_FOUND" };
  });
  const matched = members.flatMap((m) => (m.participant ? [m.participant] : []));
  const anchorAddedFromSearch = !matched.some((p) => p.id === picked.id);
  if (anchorAddedFromSearch) matched.unshift({ id: picked.id, name: picked.name });

  // ── Same-name team in this contingent + competition? ──
  const wanted = norm(sub.teamName ?? "");
  const candidates = await db.team.findMany({
    where: { contingentId: contingent.id, competitionId: competition.id },
    select: {
      id: true, name: true, status: true,
      members: { select: { participant: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  const same = candidates.filter((t) => norm(t.name) === wanted);
  const existing = same.find((t) => t.status === "ACTIVE") ?? same[0] ?? null;
  const existingTeam = existing
    ? { id: existing.id, name: existing.name, members: existing.members.map((m) => m.participant) }
    : null;

  // The anchor must be a member of the team the registration points at.
  let anchor = { id: picked.id, name: picked.name };
  if (existingTeam && !existingTeam.members.some((m) => m.id === picked.id) && existingTeam.members[0])
    anchor = existingTeam.members[0];

  const finalMembers = existingTeam ? existingTeam.members : matched;
  const base = {
    contingent, anchor, teamName: (sub.teamName ?? "").trim(), members, anchorAddedFromSearch,
    outcome: existingTeam ? ("LINK_EXISTING" as const) : ("CREATE_TEAM" as const),
    existingTeam, finalMembers,
  };
  const fail = (code: string, detail?: string): TeamPreview => ({ ...base, error: { code, detail } });

  // ── Blocking checks ──
  if (existingTeam) {
    if (existingTeam.members.length === 0) return fail("EXISTING_TEAM_EMPTY");
    const reg = await db.walkInRegistration.findFirst({
      where: { walkInCompetitionId: sub.walkInCompetitionId, teamId: existingTeam.id, status: { in: ["PENDING", "CONFIRMED"] } },
      select: { id: true },
    });
    if (reg) return fail("TEAM_ALREADY_REGISTERED");
  } else {
    const { min } = teamSizeBounds(competition);
    if (matched.length < min) return fail("TEAM_TOO_SMALL", `${matched.length} / ${min}`);
    const problem = await checkTeamPeople({
      contingentId: contingent.id, competition,
      memberIds: matched.map((m) => m.id), trainerIds: [], eventId,
    });
    if (problem) return fail(problem.error, problem.detail);
  }

  // Nobody on the team may already hold this walk-in competition (or, with
  // Penyertaan Unik, any walk-in competition of the event).
  const ids = finalMembers.map((m) => m.id);
  const held = await db.walkInRegistration.findFirst({
    where: {
      status: { in: ["PENDING", "CONFIRMED"] },
      ...(wic.event.walkInUniqueParticipation
        ? { walkInCompetition: { eventId } }
        : { walkInCompetitionId: sub.walkInCompetitionId }),
      OR: [
        { participantId: { in: ids } },
        { team: { members: { some: { participantId: { in: ids } } } } },
      ],
    },
    select: {
      walkInCompetitionId: true,
      participant: { select: { name: true } },
      team: { select: { name: true } },
    },
  });
  if (held) {
    const who = held.team?.name ?? held.participant.name;
    return fail(held.walkInCompetitionId === sub.walkInCompetitionId ? "ALREADY_REGISTERED" : "UNIQUE_PARTICIPATION", who);
  }

  return { ...base, error: null };
}

type ConfirmResult =
  | { outcome: TeamPreview["outcome"]; registrationId: string; teamId: string }
  | { error: string; detail?: string; status: number };

class ProcessError extends Error {}

/**
 * Confirms a team submission: links the same-name team of the contingent, or
 * creates one from the matched members; enters it in the event (TeamEvent
 * ACCEPT); and registers it for the walk-in as one registration anchored on a
 * member. The preview is recomputed here, never taken from the client.
 */
export async function confirmTeamVerification(
  eventId: string, subId: string, participantId: string,
): Promise<ConfirmResult> {
  const sub = await loadTeamSubmission(eventId, subId);
  if (!sub) return { error: "NOT_FOUND", status: 404 };
  if (!sub.teamName) return { error: "NOT_A_TEAM_SUBMISSION", status: 400 };
  if (sub.status !== "PENDING") return { error: "ALREADY_PROCESSED", status: 409 };

  const preview = await previewTeamVerification(sub, participantId);
  if ("notFound" in preview) return { error: "PARTICIPANT_NOT_FOUND", status: 404 };
  if (preview.error) return { error: preview.error.code, detail: preview.error.detail, status: 409 };

  const slot = heldSlot(sub);
  if (slot && await slotTaken(sub.walkInCompetitionId, slot, { includeSubmissions: false }))
    return { error: "SLOT_TAKEN", status: 409 };

  try {
    const result = await db.$transaction(async (tx) => {
      // Re-checked inside the transaction so a double click cannot process twice.
      const fresh = await tx.walkInFormSubmission.findUnique({ where: { id: sub.id }, select: { status: true } });
      if (fresh?.status !== "PENDING") throw new ProcessError("ALREADY_PROCESSED");

      const teamId = preview.existingTeam
        ? preview.existingTeam.id
        : (await tx.team.create({
            data: {
              name: preview.teamName,
              competitionId: sub.walkInCompetition.competition.id,
              contingentId: preview.contingent.id,
              members: { create: preview.finalMembers.map((m) => ({ participantId: m.id })) },
            },
            select: { id: true },
          })).id;

      await tx.teamEvent.upsert({
        where: { teamId_eventId: { teamId, eventId } },
        create: { teamId, eventId, acceptance: "ACCEPT" },
        update: { acceptance: "ACCEPT" },
      });

      const reg = await tx.walkInRegistration.create({
        data: {
          walkInCompetitionId: sub.walkInCompetitionId,
          participantId: preview.anchor.id,
          contingentId: preview.contingent.id,
          teamId,
          status: "CONFIRMED",
          method: "COUNTER",
          confirmedAt: new Date(),
          ...slot,
        },
        select: { id: true },
      });

      await tx.walkInFormSubmission.update({
        where: { id: sub.id },
        data: {
          status: "PROCESSED",
          participantId: preview.anchor.id,
          teamId,
          walkInRegistrationId: reg.id,
          processedAt: new Date(),
        },
      });
      return { registrationId: reg.id, teamId };
    });
    return { outcome: preview.outcome, ...result };
  } catch (e: unknown) {
    if (e instanceof ProcessError) return { error: e.message, status: 409 };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { error: isSlotConflict(e) ? "SLOT_TAKEN" : "ALREADY_REGISTERED", status: 409 };
    throw e;
  }
}
