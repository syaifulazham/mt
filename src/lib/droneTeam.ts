import { db } from "@/lib/db";
import { resolveLaunchLink } from "@/lib/arena-client";
import { droneArena, eptimdrone } from "@/lib/eptim-drone";

// Team-side Eptim Drone operations. Drone competitions are team competitions,
// and each Drone player is the TEAM account (userid = team id), member of the
// sector for the team's contingent — the scheme the Pasukan page's Drone panel
// already uses, so the two stay on the same player.

const VISIBLE_EVENT_STATUSES = ["PUBLISHED", "ACTIVE"];

type ArenaChallengeRef = { id: string; name: string; challenge_mode: string; status: string };

function randomPassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const tolerate409 = (e: { status?: number }) => { if (e.status !== 409) throw e; };

/**
 * The team's Drone player, created on first use: sector for the contingent,
 * player with userid = team id, sector membership. Every step tolerates 409, so
 * a half-finished earlier attempt simply resumes. Same steps as
 * POST /api/v2/participant/drone/team/register, which now delegates here.
 */
export async function ensureDroneTeamAccount(teamId: string): Promise<{ userid: string; contingentId: string }> {
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: {
      id: true, name: true,
      droneAccess: { select: { droneUserId: true } },
      contingent: {
        select: {
          id: true, name: true, shortName: true, contingentType: true,
          state:             { select: { name: true } },
          school:            { select: { state: { select: { name: true } } } },
          higherInstitution: { select: { state: { select: { name: true } } } },
        },
      },
    },
  });
  if (!team) throw Object.assign(new Error("Pasukan tidak ditemui."), { status: 404 });

  const { id: contingentId, name: contingentName, shortName, contingentType, state, school, higherInstitution } = team.contingent;
  const region = state?.name ?? school?.state?.name ?? higherInstitution?.state?.name ?? "Malaysia";

  if ((await eptimdrone.checkSector(contingentId)).available) {
    await eptimdrone.createSector({
      sector_name: contingentName, region, custom_id: contingentId,
      other_details: { shortName: shortName ?? undefined, contingentType: contingentType ?? undefined },
    }).catch(tolerate409);
  }

  const userid = team.droneAccess?.droneUserId ?? team.id;
  if (!team.droneAccess) {
    let password = "__existing__"; // exists on Drone already, password unknown here
    if ((await eptimdrone.checkUser(userid)).available) {
      password = randomPassword();
      await eptimdrone.createUser({ userid, password, full_name: team.name }).catch(tolerate409);
    }
    await db.teamDroneAccess.create({ data: { teamId: team.id, droneUserId: userid, dronePassword: password } });
  }

  await eptimdrone.assignMember(contingentId, userid).catch(tolerate409);
  return { userid, contingentId };
}

/**
 * The participant's own Drone player, for INDIVIDUAL Drone competitions:
 * sector for the contingent, player with userid = IC digits, membership,
 * recorded in DroneAccess. Same scheme as POST /api/v2/participant/drone/register,
 * which now delegates here. Throws `{ status: 422 }` without an IC.
 */
export async function ensureDroneParticipantAccount(participantId: string): Promise<{ userid: string; contingentId: string }> {
  const participant = await db.participant.findUnique({
    where: { id: participantId },
    select: {
      id: true, ic: true, name: true,
      droneAccesses: { select: { droneUserId: true }, take: 1 },
      contingent: {
        select: {
          id: true, name: true, shortName: true, contingentType: true,
          state:             { select: { name: true } },
          school:            { select: { state: { select: { name: true } } } },
          higherInstitution: { select: { state: { select: { name: true } } } },
        },
      },
    },
  });
  if (!participant?.contingent)
    throw Object.assign(new Error("Peserta atau kontinjen tidak ditemui."), { status: 404 });

  const { id: contingentId, name: contingentName, shortName, contingentType, state, school, higherInstitution } = participant.contingent;
  const existing = participant.droneAccesses[0]?.droneUserId;
  const userid = existing ?? (participant.ic ?? "").replace(/\D/g, "");
  if (!userid)
    throw Object.assign(
      new Error("Nombor kad pengenalan diperlukan sebelum mendaftar Eptim Drone. Kemas kini profil anda."),
      { status: 422 },
    );

  const region = state?.name ?? school?.state?.name ?? higherInstitution?.state?.name ?? "Malaysia";
  if ((await eptimdrone.checkSector(contingentId)).available) {
    await eptimdrone.createSector({
      sector_name: contingentName, region, custom_id: contingentId,
      other_details: { shortName: shortName ?? undefined, contingentType: contingentType ?? undefined },
    }).catch(tolerate409);
  }

  if (!existing) {
    let password = "__existing__";
    if ((await eptimdrone.checkUser(userid)).available) {
      password = randomPassword();
      await eptimdrone.createUser({ userid, password, full_name: participant.name }).catch(tolerate409);
    }
    await db.droneAccess.create({ data: { participantId: participant.id, droneUserId: userid, dronePassword: password } });
  }

  await eptimdrone.assignMember(contingentId, userid).catch(tolerate409);
  return { userid, contingentId };
}

/**
 * Whether a participant may act on one Drone challenge for one of their teams:
 * they are a member, the team belongs to this Drone competition and is entered
 * in the event, the event is open, and the organizer picked the challenge.
 * Recomputed server-side for every action rather than trusted from the dashboard.
 */
export async function loadDroneChallengeAccess(
  participantId: string, teamId: string, eventCompetitionId: string, challengeId: string,
) {
  const member = await db.teamMember.findUnique({
    where:  { teamId_participantId: { teamId, participantId } },
    select: { team: { select: { id: true, competitionId: true, contingentId: true } } },
  });
  if (!member) return { error: "Anda bukan ahli pasukan ini.", status: 403 } as const;

  const ec = await db.eventCompetition.findUnique({
    where: { id: eventCompetitionId },
    select: {
      id: true, eventId: true, competitionId: true, droneChallenges: true,
      event: { select: { status: true } },
      competition: { select: { thirdPartyIntegration: true } },
    },
  });
  if (!ec || ec.competitionId !== member.team.competitionId) return { error: "NOT_FOUND", status: 404 } as const;
  if (ec.competition.thirdPartyIntegration !== "eptim-drone") return { error: "NOT_INTEGRATED", status: 409 } as const;
  if (!VISIBLE_EVENT_STATUSES.includes(ec.event.status)) return { error: "Acara ini belum dibuka.", status: 409 } as const;

  const entered = await db.teamEvent.findUnique({
    where:  { teamId_eventId: { teamId, eventId: ec.eventId } },
    select: { id: true },
  });
  if (!entered) return { error: "Pasukan ini belum didaftarkan ke acara ini.", status: 409 } as const;

  const challenge = ((ec.droneChallenges as ArenaChallengeRef[] | null) ?? []).find((c) => c.id === challengeId);
  if (!challenge) return { error: "Cabaran ini tidak ditawarkan untuk pertandingan ini.", status: 404 } as const;

  return { team: member.team, ec, challenge } as const;
}

/** Launch link for one team registration: stored while valid, else a new one stored on the row. */
export function droneChallengeLaunchLink(
  row: { id: string; launchCode: string | null; launchUrl: string | null },
  userid: string,
  contingentId: string,
): Promise<{ url: string; expiresAt: string }> {
  return resolveLaunchLink(droneArena, row, userid, contingentId, (fresh) =>
    db.teamDroneChallenge.update({
      where: { id: row.id },
      data:  { launchCode: fresh.code, launchUrl: fresh.url, launchExpiresAt: fresh.expiresAt },
    }),
  );
}

/** Stable reference MT sends as `external_ref`, so Drone rows trace back here. */
export function droneExternalRef(eventCompetitionId: string, teamId: string) {
  return `mt:${eventCompetitionId}:team:${teamId}`;
}
