import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { eptimdrone } from "@/lib/eptim-drone";

// GET /api/v2/organizer/drone/challenges — challenges of the Eptim Drone event the key belongs to
export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!process.env.EPTIMDRONE_BASE_URL || !process.env.EPTIMDRONE_API_KEY)
    return NextResponse.json({ error: "EPTIMDRONE_API_KEY not found" }, { status: 503 });

  try {
    const { event_id, challenges } = await eptimdrone.listChallenges();
    return NextResponse.json({ eventId: event_id, data: challenges ?? [] });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    console.error("[eptimdrone] listChallenges failed:", err.message);
    const message = err.status === 401
      ? "Kunci API Eptim Drone ditolak atau tamat tempoh (EPTIMDRONE_API_KEY). Hubungi pentadbir."
      : err.message ?? "Ralat API Eptim Drone";
    return NextResponse.json({ error: message }, { status: err.status ?? 422 });
  }
}
