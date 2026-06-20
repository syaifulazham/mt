import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { eptimdrone } from "@/lib/eptim-drone";

function randomPassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // competitionId accepted but not stored — kept for API consistency
  await req.json().catch(() => ({}));

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: {
      id: true, ic: true, name: true,
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

  const icDigits = (participant.ic ?? "").replace(/\D/g, "");
  if (!icDigits) return NextResponse.json({ error: "NO_IC" }, { status: 422 });

  const contingentId = String(participant.contingent.id);
  const { name: contingentName, state, school, higherInstitution, shortName, contingentType } = participant.contingent;
  const region = state?.name ?? school?.state?.name ?? higherInstitution?.state?.name ?? "Malaysia";

  // 1. Create sector if it doesn't exist
  const sectorCheck = await eptimdrone.checkSector(contingentId);
  if (sectorCheck.available) {
    await eptimdrone.createSector({
      sector_name: contingentName,
      region,
      custom_id: contingentId,
      other_details: { shortName: shortName ?? undefined, contingentType: contingentType ?? undefined },
    }).catch(e => {
      if (e.status !== 409) throw e;
    });
  }

  // 2. Create or retrieve user credentials
  const existing = await db.droneAccess.findUnique({ where: { participantId: session.participantId } });

  if (!existing) {
    const userCheck = await eptimdrone.checkUser(icDigits);
    let password: string;
    if (userCheck.available) {
      password = randomPassword();
      await eptimdrone.createUser({ userid: icDigits, password, full_name: participant.name }).catch(e => {
        if (e.status !== 409) throw e;
      });
    } else {
      password = "__existing__";
    }
    await db.droneAccess.create({
      data: { participantId: session.participantId, droneUserId: icDigits, dronePassword: password },
    });
  }

  // 3. Assign user to sector (idempotent — 409 is fine)
  await eptimdrone.assignMember(contingentId, icDigits).catch(e => {
    if (e.status !== 409) throw e;
  });

  return NextResponse.json({ ok: true });
}
