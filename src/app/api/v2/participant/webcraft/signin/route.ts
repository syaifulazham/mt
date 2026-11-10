import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { webcraftConfigured, webcraftLogin } from "@/lib/eptim-webcraft";
import { ensureTeamWebcraftAccess, loadTeamWebcraft } from "@/lib/webcraft-team";

// POST /api/v2/participant/webcraft/signin — direct-login to WebCraft account
// Body { teamId } signs in to the team's shared account, so every member opens the same projects.
export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!webcraftConfigured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  const { teamId } = await req.json().catch(() => ({})) as { teamId?: string };
  let access: { webcraftUserId: string; webcraftPassword: string } | null;
  if (teamId) {
    const ctx = await loadTeamWebcraft(teamId, session.participantId);
    if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: 403 });
    if (!ctx.access && ctx.memberAccounts.length === 0) return NextResponse.json({ error: "NOT_REGISTERED" }, { status: 404 });
    try {
      access = await ensureTeamWebcraftAccess(ctx);
    } catch (e: unknown) {
      return NextResponse.json({ error: (e as Error).message ?? "Login failed" }, { status: 502 });
    }
  } else {
    access = await db.participantWebcraftAccess.findUnique({
      where: { participantId: session.participantId },
    });
  }
  if (!access) return NextResponse.json({ error: "NOT_REGISTERED" }, { status: 404 });

  try {
    const result = await webcraftLogin(access.webcraftUserId, access.webcraftPassword);
    return NextResponse.json({
      accessToken:  result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn:    result.expiresIn,
      appUrl:       process.env.EPTIM_WEBCRAFT_APP_URL ?? "",
    });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    if (err.status === 401) return NextResponse.json({ error: "Kunci API WebCraft ditolak (EPTIM_WEBCRAFT_API_KEY). Hubungi pentadbir." }, { status: 502 });
    if (err.status === 403) return NextResponse.json({ error: "Akaun digantung. Sila hubungi penganjur." }, { status: 403 });
    if (err.status === 429) return NextResponse.json({ error: "Terlalu banyak percubaan. Cuba sebentar lagi." }, { status: 429 });
    return NextResponse.json({ error: err.message ?? "Login failed" }, { status: err.status ?? 502 });
  }
}
