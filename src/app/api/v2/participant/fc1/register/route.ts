import { NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { fc1Configured, fc1ErrorMessage } from "@/lib/eptim-fc1";
import { ensureFc1Account } from "@/lib/fc1Participant";

/**
 * POST — create the participant's Eptim FC-1 player account.
 *
 * The dashboard no longer calls this directly: registering for a challenge
 * creates the account on first use. Kept for API compatibility.
 */
export async function POST() {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!fc1Configured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  try {
    const { userid } = await ensureFc1Account(session.participantId);
    return NextResponse.json({ ok: true, userid });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error(`[eptim-fc1] register failed for participant ${session.participantId}:`, err.message, "| upstream:", err.detail ?? "—");
    return NextResponse.json({ error: err.status === 422 || err.status === 404 ? err.message : fc1ErrorMessage(err) }, { status: err.status ?? 422 });
  }
}
