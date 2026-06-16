import { NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";

/** POST — generate SSO login URL for the participant's LMS account */
export async function POST() {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!eptimEduConfigured())
    return NextResponse.json({ error: "EPTIMEDU_NOT_CONFIGURED" }, { status: 503 });

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: { ic: true },
  });
  if (!participant) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const icDigits = participant.ic?.replace(/\D/g, "") ?? "";
  if (!icDigits) return NextResponse.json({ error: "NO_IC" }, { status: 400 });

  try {
    const result = await eptimEdu.createSsoToken(icDigits);
    return NextResponse.json({ loginUrl: result.loginUrl });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "EptimEdu API error";
    console.error("[bengkel/signin POST] eptim-edu error:", msg, { icDigits });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
