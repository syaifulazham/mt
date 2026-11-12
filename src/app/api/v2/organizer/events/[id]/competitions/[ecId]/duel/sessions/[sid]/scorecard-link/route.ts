import { NextRequest, NextResponse } from "next/server";
import { DUEL_CONTROL_ROLES, duelErr, duelGuard, loadDuelSession } from "@/lib/duel-server";
import { ensureScorecardLink } from "@/lib/duel-scorecard-link";

type Params = { params: Promise<{ id: string; ecId: string; sid: string }> };

// POST — this session's scorecard link (/scorecard/<slug>) and its 5-character
// passcode, created on first request. Needs the competition's scorecard on.
export async function POST(_req: NextRequest, { params }: Params) {
  const { id, ecId, sid } = await params;
  const g = await duelGuard(id, ecId, DUEL_CONTROL_ROLES);
  if ("res" in g) return g.res;
  if (!g.cfg.scorecard.enabled) return duelErr("NO_SCORECARD", "Kad skor belum diaktifkan — tetapkan di Penghakiman → Kad skor duel.", 409);
  const s = await loadDuelSession(ecId, sid);
  if (!s) return duelErr("NOT_FOUND", "Sesi tidak dijumpai.", 404);
  if (s.round.status === "DRAFT") return duelErr("NOT_CONFIRMED", "Sahkan cabutan dahulu.", 409);
  return NextResponse.json(await ensureScorecardLink(s.id, ecId));
}
