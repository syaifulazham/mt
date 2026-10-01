import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { fc1Configured, fc1ErrorMessage, fc1ListChallenges } from "@/lib/eptim-fc1";

// GET /api/v2/organizer/fc1/challenges — challenges of the FC-1 event the key belongs to
export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!fc1Configured())
    return NextResponse.json({ error: "EPTIMFC1_API_KEY not found" }, { status: 503 });

  try {
    const { eventId, challenges } = await fc1ListChallenges();
    return NextResponse.json({ eventId, data: challenges });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error("[eptim-fc1] listChallenges failed:", err.message, "| upstream:", err.detail ?? "—");
    return NextResponse.json({ error: fc1ErrorMessage(err) }, { status: err.status ?? 422 });
  }
}
