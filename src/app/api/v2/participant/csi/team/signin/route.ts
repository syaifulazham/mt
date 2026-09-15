import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { csiConfigured, csiErrorMessage, csiLogin } from "@/lib/eptim-csi";

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

  try {
    const result = await csiLogin(
      access.csiUserId,
      access.csiPassword,
      next?.startsWith("/") ? next : undefined,
    );
    return NextResponse.json({
      loginUrl:  result.login_url,
      expiresAt: result.login_url_expires_at,
      alias:     result.user.alias,
    });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error(
      `[eptim-csi] login failed for team ${teamId} (${access.csiUserId}):`,
      err.message, "| upstream:", err.detail ?? "—",
    );
    // 401 here is the stored password no longer matching CSI, not a bad key.
    if (err.status === 401)
      return NextResponse.json(
        { error: "Kata laluan Eptim CSI tidak sah lagi. Daftar semula untuk menetapkannya." },
        { status: 409 },
      );
    return NextResponse.json({ error: csiErrorMessage(err) }, { status: err.status ?? 502 });
  }
}
