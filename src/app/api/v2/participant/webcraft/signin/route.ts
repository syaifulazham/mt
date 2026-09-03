import { NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { webcraftConfigured, webcraftLogin } from "@/lib/eptim-webcraft";

// POST /api/v2/participant/webcraft/signin — direct-login to WebCraft account
export async function POST() {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!webcraftConfigured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  const access = await db.participantWebcraftAccess.findUnique({
    where: { participantId: session.participantId },
  });
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
