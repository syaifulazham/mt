import { db } from "@/lib/db";
import {
  fc1AssignMember, fc1CheckSector, fc1CheckUser, fc1CreateSector, fc1CreateUser,
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

/**
 * The participant's FC-1 player, created on first use. Mirrors the Drone
 * integration, which talks to the same kind of API:
 *   1. the contingent's sector exists (custom_id = contingent id)
 *   2. the player exists (userid = IC digits)
 *   3. the player is a member of that sector — FC-1 refuses sign-in otherwise
 * Every step tolerates 409, so a half-finished earlier attempt simply resumes.
 * Throws `{ status: 422 }` when the participant has no IC to key the player on.
 */
export async function ensureFc1Account(participantId: string): Promise<{ userid: string; contingentId: string }> {
  const participant = await db.participant.findUnique({
    where: { id: participantId },
    select: {
      id: true, ic: true, name: true,
      fc1Access: { select: { fc1UserId: true } },
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
  if (participant.fc1Access) return { userid: participant.fc1Access.fc1UserId, contingentId };

  const userid = (participant.ic ?? "").replace(/\D/g, "");
  if (!userid)
    throw Object.assign(
      new Error("Nombor kad pengenalan diperlukan sebelum mendaftar FC-1. Kemas kini profil anda."),
      { status: 422 },
    );

  const region = state?.name ?? school?.state?.name ?? higherInstitution?.state?.name ?? "Malaysia";
  if ((await fc1CheckSector(contingentId)).available) {
    await fc1CreateSector({
      sector_name: contingentName, custom_id: contingentId, region,
      other_details: { shortName: shortName ?? undefined, contingentType: contingentType ?? undefined },
    }).catch(tolerate409);
  }

  let password = "__existing__";
  if ((await fc1CheckUser(userid)).available) {
    password = randomPassword();
    await fc1CreateUser({ userid, password, full_name: participant.name }).catch(tolerate409);
  }
  await fc1AssignMember(contingentId, userid).catch(tolerate409);
  await db.participantFc1Access.create({
    data: { participantId: participant.id, fc1UserId: userid, fc1Password: password },
  });
  return { userid, contingentId };
}
