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

  const { teamId } = await req.json().catch(() => ({})) as { teamId?: string };
  if (!teamId) return NextResponse.json({ error: "MISSING_TEAM_ID" }, { status: 400 });

  // Verify the caller is a member of this team
  const membership = await db.teamMember.findUnique({
    where: { teamId_participantId: { teamId, participantId: session.participantId } },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          contingent: {
            select: {
              id: true,
              name: true,
              shortName: true,
              contingentType: true,
              state:             { select: { name: true } },
              school:            { select: { state: { select: { name: true } } } },
              higherInstitution: { select: { state: { select: { name: true } } } },
            },
          },
          droneAccess: true,
        },
      },
    },
  });
  if (!membership) return NextResponse.json({ error: "NOT_MEMBER" }, { status: 403 });

  const { team } = membership;
  const contingentId = String(team.contingent.id);
  const { name: contingentName, state, school, higherInstitution, shortName, contingentType } = team.contingent;
  const region = state?.name ?? school?.state?.name ?? higherInstitution?.state?.name ?? "Malaysia";

  // 1. Create sector (contingent) if not yet registered
  const sectorCheck = await eptimdrone.checkSector(contingentId);
  if (sectorCheck.available) {
    await eptimdrone.createSector({
      sector_name: contingentName,
      region,
      custom_id:   contingentId,
      other_details: { shortName: shortName ?? undefined, contingentType: contingentType ?? undefined },
    }).catch(e => { if (e.status !== 409) throw e; });
  }

  // 2. Create/retrieve drone user for this team (team.id as userid, team.name as full_name)
  const droneUserId = team.id;

  if (!team.droneAccess) {
    const userCheck = await eptimdrone.checkUser(droneUserId);
    let password: string;
    if (userCheck.available) {
      password = randomPassword();
      await eptimdrone.createUser({
        userid:    droneUserId,
        password,
        full_name: team.name,
      }).catch(e => { if (e.status !== 409) throw e; });
    } else {
      // User exists on drone platform but no local record — note password unknown
      password = "__existing__";
    }
    await db.teamDroneAccess.create({
      data: { teamId, droneUserId, dronePassword: password },
    });
  }

  // 3. Assign team user to sector (idempotent — 409 is fine)
  await eptimdrone.assignMember(contingentId, droneUserId).catch(e => {
    if (e.status !== 409) throw e;
  });

  return NextResponse.json({ ok: true });
}
