import { NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import {
  fc1AssignMember, fc1CheckSector, fc1CheckUser, fc1Configured, fc1CreateSector, fc1CreateUser, fc1ErrorMessage,
} from "@/lib/eptim-fc1";

function randomPassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/**
 * POST — create the participant's Eptim FC-1 player account.
 *
 * Mirrors participant/drone/register, which talks to the same kind of API:
 *   1. the contingent's sector exists (custom_id = contingent id)
 *   2. the player exists (userid = IC digits)
 *   3. the player is a member of that sector — /auth/token refuses otherwise
 * Every step tolerates 409, so a half-finished earlier attempt is simply resumed.
 */
export async function POST() {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!fc1Configured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: {
      id: true, ic: true, name: true,
      fc1Access: { select: { id: true } },
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
  if (!participant || !participant.contingent)
    return NextResponse.json({ error: "PARTICIPANT_NOT_FOUND" }, { status: 404 });

  const userid = (participant.ic ?? "").replace(/\D/g, "");
  if (!userid)
    return NextResponse.json(
      { error: "Nombor kad pengenalan diperlukan sebelum mendaftar FC-1. Kemas kini profil anda." },
      { status: 422 },
    );

  const { id: contingentId, name: contingentName, shortName, contingentType, state, school, higherInstitution } = participant.contingent;
  const region = state?.name ?? school?.state?.name ?? higherInstitution?.state?.name ?? "Malaysia";
  const tolerate409 = (e: { status?: number }) => { if (e.status !== 409) throw e; };

  try {
    // 1. Sector for the contingent
    const sector = await fc1CheckSector(contingentId);
    if (sector.available) {
      await fc1CreateSector({
        sector_name: contingentName, custom_id: contingentId, region,
        other_details: { shortName: shortName ?? undefined, contingentType: contingentType ?? undefined },
      }).catch(tolerate409);
    }

    // 2. Player account
    if (!participant.fc1Access) {
      const user = await fc1CheckUser(userid);
      let password = "__existing__";
      if (user.available) {
        password = randomPassword();
        await fc1CreateUser({ userid, password, full_name: participant.name }).catch(tolerate409);
      }
      await db.participantFc1Access.create({
        data: { participantId: participant.id, fc1UserId: userid, fc1Password: password },
      });
    }

    // 3. Sector membership
    await fc1AssignMember(contingentId, userid).catch(tolerate409);

    return NextResponse.json({ ok: true, userid });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error(`[eptim-fc1] register failed for participant ${participant.id} (${userid}):`, err.message, "| upstream:", err.detail ?? "—");
    return NextResponse.json({ error: fc1ErrorMessage(err) }, { status: err.status ?? 422 });
  }
}
