import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { csiConfigured, csiCreateUser, csiErrorMessage, csiSetPassword, toCsiUserId } from "@/lib/eptim-csi";

function randomPassword(len = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// POST /api/v2/participant/csi/team/register — provision the team as an Eptim CSI player
export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!csiConfigured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

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
          competition: { select: { name: true, code: true, thirdPartyIntegration: true } },
          contingent:  { select: { name: true } },
          csiAccess:   true,
        },
      },
    },
  });
  if (!membership) return NextResponse.json({ error: "NOT_MEMBER" }, { status: 403 });

  const { team } = membership;
  if (team.competition.thirdPartyIntegration !== "eptim-csi")
    return NextResponse.json({ error: "NOT_INTEGRATED" }, { status: 409 });
  if (team.csiAccess)
    return NextResponse.json({ error: "ALREADY_REGISTERED" }, { status: 409 });

  const csiUserId = toCsiUserId(team.id);
  const password  = randomPassword();
  let alias: string | null = null;

  try {
    const created = await csiCreateUser({
      userId: csiUserId,
      name:   team.name,
      password,
      otherDetails: {
        team:            team.name,
        contingent:      team.contingent?.name ?? undefined,
        competition:     team.competition.name,
        competitionCode: team.competition.code,
      },
    });
    alias = created.alias;
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error(
      `[eptim-csi] createUser failed for team ${team.id} (${csiUserId}):`,
      err.message, "| upstream:", err.detail ?? "—",
    );
    if (err.status !== 409)
      return NextResponse.json({ error: csiErrorMessage(err) }, { status: err.status ?? 502 });

    // The player exists in CSI but we hold no password for it — rotate it so
    // remote login works again.
    try {
      const patched = await csiSetPassword(csiUserId, password);
      alias = patched.alias;
    } catch (e2: unknown) {
      const err2 = e2 as { message?: string; status?: number; detail?: string };
      console.error(
        `[eptim-csi] setPassword failed for team ${team.id} (${csiUserId}):`,
        err2.message, "| upstream:", err2.detail ?? "—",
      );
      return NextResponse.json({ error: csiErrorMessage(err2) }, { status: err2.status ?? 502 });
    }
  }

  await db.teamCsiAccess.create({
    data: { teamId: team.id, csiUserId, csiPassword: password, csiAlias: alias },
  }).catch(() => {}); // idempotent under races

  return NextResponse.json({ ok: true, csiUserId, csiAlias: alias });
}
