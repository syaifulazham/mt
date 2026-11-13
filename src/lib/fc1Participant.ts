import { db } from "@/lib/db";
import {
  fc1, fc1AssignMember, fc1CheckSector, fc1CheckUser, fc1CreateSector, fc1CreateUser, fc1RegisterChallenge,
} from "@/lib/eptim-fc1";

// The participant's FC-1 player account. The challenge flow itself is shared
// with individual Eptim Drone in individualArena.ts.

function randomPassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const tolerate409 = (e: { status?: number }) => { if (e.status !== 409) throw e; };

export type Fc1Account = { userid: string; contingentId: string; userUuid: string | null };

/** The contingent's FC-1 sector exists (custom_id = contingent id). */
async function ensureFc1Sector(c: {
  id: string; name: string; shortName: string | null; contingentType: string | null;
  state: { name: string } | null; school: { state: { name: string } | null } | null; higherInstitution: { state: { name: string } | null } | null;
}) {
  if (!(await fc1CheckSector(c.id)).available) return;
  await fc1CreateSector({
    sector_name: c.name, custom_id: c.id,
    region: c.state?.name ?? c.school?.state?.name ?? c.higherInstitution?.state?.name ?? "Malaysia",
    other_details: { shortName: c.shortName ?? undefined, contingentType: c.contingentType ?? undefined },
  }).catch(tolerate409);
}

const CONTINGENT_SELECT = {
  id: true, name: true, shortName: true, contingentType: true,
  state:             { select: { name: true } },
  school:            { select: { state: { select: { name: true } } } },
  higherInstitution: { select: { state: { select: { name: true } } } },
} as const;

/**
 * The participant's FC-1 player, created on first use. Mirrors the Drone
 * integration, which talks to the same kind of API:
 *   1. the contingent's sector exists (custom_id = contingent id)
 *   2. the player exists (userid = IC digits)
 *   3. the player is a member of that sector — FC-1 refuses sign-in otherwise
 * Every step tolerates 409, so a half-finished earlier attempt simply resumes.
 * FC-1's own id for the player (uuid) is kept and used from then on: its
 * lookup by userid has answered "User not found" for players that exist.
 * Throws `{ status: 422 }` when the participant has no IC to key the player on.
 */
export async function ensureFc1Account(participantId: string): Promise<Fc1Account> {
  const participant = await db.participant.findUnique({
    where: { id: participantId },
    select: {
      id: true, ic: true, name: true,
      fc1Access: { select: { fc1UserId: true, fc1Uuid: true } },
      contingent: { select: CONTINGENT_SELECT },
    },
  });
  if (!participant?.contingent)
    throw Object.assign(new Error("Peserta atau kontinjen tidak ditemui."), { status: 404 });

  const contingentId = participant.contingent.id;
  if (participant.fc1Access)
    return { userid: participant.fc1Access.fc1UserId, contingentId, userUuid: participant.fc1Access.fc1Uuid };

  const userid = (participant.ic ?? "").replace(/\D/g, "");
  if (!userid)
    throw Object.assign(
      new Error("Nombor kad pengenalan diperlukan sebelum mendaftar FC-1. Kemas kini profil anda."),
      { status: 422 },
    );

  await ensureFc1Sector(participant.contingent);

  let password = "__existing__";
  let userUuid: string | null = null;
  if ((await fc1CheckUser(userid)).available) {
    password = randomPassword();
    // 409: the player exists although the check said otherwise (FC-1's lookup by userid failing).
    const created = await fc1CreateUser({ userid, password, full_name: participant.name }).catch((e) => { tolerate409(e); return null; });
    if (created) userUuid = created.id; else password = "__existing__";
  }
  // An existing player may already be in the sector: its uuid is in the member list.
  userUuid ??= await fc1.memberUuid(contingentId, userid).catch(() => null);
  await fc1AssignMember(contingentId, userid, userUuid).catch(tolerate409);
  await db.participantFc1Access.create({
    data: { participantId: participant.id, fc1UserId: userid, fc1Password: password, fc1Uuid: userUuid },
  });
  return { userid, contingentId, userUuid };
}

/** FC-1 answered that the player does not exist (it lost the player, or its lookup by userid failed). */
export function isFc1UserMissing(e: unknown) {
  const err = e as { status?: number; message?: string; detail?: string };
  return err.status === 404 && /(user|player) not found/i.test(`${err.message ?? ""} ${err.detail ?? ""}`);
}

/**
 * FC-1's own id for the participant's player: the stored one, else found in
 * the contingent sector's member list (by synthetic email) and stored. Null
 * when MT has no FC-1 account for the participant or the player isn't a member.
 */
export async function resolveFc1Uuid(participantId: string, opts: { refresh?: boolean } = {}): Promise<string | null> {
  const p = await db.participant.findUnique({
    where:  { id: participantId },
    select: { contingentId: true, fc1Access: { select: { id: true, fc1UserId: true, fc1Uuid: true } } },
  });
  if (!p?.fc1Access || !p.contingentId) return null;
  if (p.fc1Access.fc1Uuid && !opts.refresh) return p.fc1Access.fc1Uuid;
  const uuid = await fc1.memberUuid(p.contingentId, p.fc1Access.fc1UserId);
  if (uuid && uuid !== p.fc1Access.fc1Uuid)
    await db.participantFc1Access.update({ where: { id: p.fc1Access.id }, data: { fc1Uuid: uuid } });
  return uuid;
}

/**
 * Recover a player FC-1 says it cannot find, from MT's stored account.
 *
 * Usually the player still exists and only FC-1's lookup by userid fails: its
 * uuid is then read from the sector's member list and used from here on. When
 * the player is really gone it is created again (stored password; a fresh one
 * if MT never knew it). Either way sector membership and every challenge
 * registration MT has on record are restored — by uuid. Each step tolerates
 * 409, so concurrent repairs are harmless.
 */
export async function repairFc1Account(participantId: string): Promise<Fc1Account> {
  const p = await db.participant.findUnique({
    where:  { id: participantId },
    select: {
      id: true, name: true, contingentId: true,
      contingent: { select: CONTINGENT_SELECT },
      fc1Access: { select: { id: true, fc1UserId: true, fc1Password: true } },
      fc1Challenges: { select: { challengeId: true, eventCompetitionId: true } },
    },
  });
  if (!p?.fc1Access || !p.contingentId || !p.contingent) return ensureFc1Account(participantId);
  const { fc1UserId: userid } = p.fc1Access;
  const contingentId = p.contingentId;

  await ensureFc1Sector(p.contingent);
  // Re-read from the member list even if a uuid is stored: it may be the stale one that just failed.
  let userUuid = await resolveFc1Uuid(participantId, { refresh: true });
  if (!userUuid) {
    let password = p.fc1Access.fc1Password;
    if (!password || password === "__existing__") password = randomPassword();
    const created = await fc1CreateUser({ userid, password, full_name: p.name }).catch((e) => { tolerate409(e); return null; });
    if (created) {
      userUuid = created.id;
      await db.participantFc1Access.update({ where: { id: p.fc1Access.id }, data: { fc1Password: password, fc1Uuid: userUuid } });
    } else {
      // Exists on FC-1 (409) but not in this sector and not findable by userid: only FC-1 can resolve it.
      throw Object.assign(
        new Error("Akaun FC-1 anda wujud tetapi tidak dapat dicapai oleh Eptim FC-1 buat masa ini. Sila hubungi penganjur."),
        { status: 409, detail: `fc1 player ${userid}: create=409, not in sector ${contingentId}, lookup by userid fails` },
      );
    }
  }
  await fc1AssignMember(contingentId, userid, userUuid).catch(tolerate409);
  for (const c of p.fc1Challenges) {
    await fc1RegisterChallenge({
      challengeId: c.challengeId, userid, userUuid, externalRef: `mt:${c.eventCompetitionId}:${p.id}`,
    });
  }
  console.warn(`[eptim-fc1] recovered player for participant ${p.id} by uuid (${p.fc1Challenges.length} challenge registration(s) restored)`);
  return { userid, contingentId, userUuid };
}
