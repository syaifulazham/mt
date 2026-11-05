import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDuelConfig } from "@/lib/duel";
import { DUEL_CONFIG_ROLES, duelErr, duelGuard } from "@/lib/duel-server";

type Params = { params: Promise<{ id: string; ecId: string }> };

// PATCH { judgingMethod?: "SCORE" | "DUEL", duelConfig?: {...} }
// Back to SCORE is refused once a round is confirmed (its results would vanish).
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, ecId } = await params;
  const g = await duelGuard(id, ecId, DUEL_CONFIG_ROLES);
  if ("res" in g) return g.res;
  const body = await req.json().catch(() => ({}));

  const data: { judgingMethod?: string; duelConfig?: object } = {};
  if (body.judgingMethod !== undefined) {
    if (body.judgingMethod !== "SCORE" && body.judgingMethod !== "DUEL") return duelErr("INVALID_METHOD", "Kaedah tidak sah.");
    if (body.judgingMethod === "SCORE" && g.ec.judgingMethod === "DUEL") {
      const confirmed = await db.duelRound.count({ where: { eventCompetitionId: ecId, status: { not: "DRAFT" } } });
      if (confirmed) return duelErr("DUEL_STARTED", "Duel sudah disahkan — kaedah tidak boleh ditukar ke Skor.", 409);
    }
    data.judgingMethod = body.judgingMethod;
  }
  if (body.duelConfig !== undefined) {
    const next = parseDuelConfig(body.duelConfig);
    // The scope decides which bracket every round belongs to.
    if (next.scope !== g.cfg.scope && await db.duelRound.count({ where: { eventCompetitionId: ecId } }))
      return duelErr("SCOPE_LOCKED", "Skop tidak boleh ditukar selepas cabutan dibuat. Buang draf/pusingan dahulu.", 409);
    data.duelConfig = next;
  }

  const ec = await db.eventCompetition.update({
    where: { id: ecId }, data, select: { judgingMethod: true, duelConfig: true },
  });
  return NextResponse.json({ judgingMethod: ec.judgingMethod, duelConfig: parseDuelConfig(ec.duelConfig) });
}
