import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { vibeBlocksListChallenges } from "@/lib/vibeblocks";
import { GAME_PROVIDERS, asGameProvider } from "@/lib/game-provider";

// GET /api/v2/organizer/vibeblocks/challenges?provider=vibeblocks|techtriathlon
export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const p = asGameProvider(req.nextUrl.searchParams.get("provider"));

  try {
    const data = await vibeBlocksListChallenges(undefined, p);
    return NextResponse.json({ challenges: data.challenges });
  } catch {
    const c = GAME_PROVIDERS[p].defaultChallenge;
    return NextResponse.json({
      challenges: [{ ...c, description: null, status: "active", order_index: 1, created_at: "2026-01-01T00:00:00.000Z" }],
    });
  }
}
