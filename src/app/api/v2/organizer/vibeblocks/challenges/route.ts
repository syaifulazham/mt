import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { vibeBlocksListChallenges } from "@/lib/vibeblocks";

const FALLBACK_CHALLENGES = [
  {
    id: "machine-driving-five-stage",
    name: "Machine Driving – Five Stage Challenge",
    description: "Complete five machine-driving stages; more completed stages rank first, then lower official elapsed time.",
    challenge_mode: "ranked",
    status: "active",
    order_index: 1,
    created_at: "2026-08-12T00:00:00.000Z",
  },
];

// GET /api/v2/organizer/vibeblocks/challenges
export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const data = await vibeBlocksListChallenges();
    return NextResponse.json({ challenges: data.challenges });
  } catch {
    return NextResponse.json({ challenges: FALLBACK_CHALLENGES });
  }
}
