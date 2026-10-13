import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { csiConfigured, csiErrorMessage, csiLogin, csiSetPassword } from "@/lib/eptim-csi";

function randomPassword(len = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const isInvalidCredentials = (e: unknown) => (e as { status?: number }).status === 401;

// POST /api/v2/participant/csi/team/signin — mint a one-time Eptim CSI login link
export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!csiConfigured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  const { teamId, next } = await req.json().catch(() => ({})) as { teamId?: string; next?: string };
  if (!teamId) return NextResponse.json({ error: "MISSING_TEAM_ID" }, { status: 400 });

  // Verify the caller is a member of this team
  const membership = await db.teamMember.findUnique({
    where: { teamId_participantId: { teamId, participantId: session.participantId } },
  });
  if (!membership) return NextResponse.json({ error: "NOT_MEMBER" }, { status: 403 });

  const access = await db.teamCsiAccess.findUnique({ where: { teamId } });
  if (!access) return NextResponse.json({ error: "NOT_REGISTERED" }, { status: 404 });

  const nextPath = next?.startsWith("/") ? next : undefined;
  const ok = (r: Awaited<ReturnType<typeof csiLogin>>) => NextResponse.json({
    loginUrl:  r.login_url,
    expiresAt: r.login_url_expires_at,
    alias:     r.user.alias,
  });

  try {
    try {
      return ok(await csiLogin(access.csiUserId, access.csiPassword, nextPath));
    } catch (e: unknown) {
      if (!isInvalidCredentials(e)) throw e;
      console.warn(`[eptim-csi] stored password rejected for team ${teamId} (${access.csiUserId}) — repairing`);
    }

    // CSI rejected the stored password: CSI and MT disagree (e.g. a concurrent
    // register reset it, or something else set it). MT is the only holder of
    // these passwords — students sign in through one-time links — so set a new
    // one on CSI and keep it.
    //
    // Compare-and-swap first: only the request that still sees the password
    // that just failed gets to rotate. A concurrent request that lost the swap
    // simply logs in with whatever the winner stored, so two members clicking
    // at once can't leave CSI and MT disagreeing again.
    const fresh = randomPassword();
    const claimed = await db.teamCsiAccess.updateMany({
      where: { teamId, csiPassword: access.csiPassword },
      data:  { csiPassword: fresh },
    });
    if (claimed.count === 1) {
      await csiSetPassword(access.csiUserId, fresh);
      return ok(await csiLogin(access.csiUserId, fresh, nextPath));
    }
    const current = await db.teamCsiAccess.findUnique({ where: { teamId }, select: { csiPassword: true } });
    if (!current) return NextResponse.json({ error: "NOT_REGISTERED" }, { status: 404 });
    return ok(await csiLogin(access.csiUserId, current.csiPassword, nextPath));
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error(
      `[eptim-csi] login failed for team ${teamId} (${access.csiUserId}):`,
      err.message, "| upstream:", err.detail ?? "—",
    );
    // Still rejected after the repair (or the repair itself failed): nothing
    // the student can do on their side, so don't send them to re-register.
    if (isInvalidCredentials(err))
      return NextResponse.json(
        { error: "Log masuk Eptim CSI gagal. Cuba lagi sebentar; jika masih gagal, hubungi penganjur." },
        { status: 409 },
      );
    return NextResponse.json({ error: csiErrorMessage(err) }, { status: err.status ?? 502 });
  }
}
