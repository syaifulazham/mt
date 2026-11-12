import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDuelConfig } from "@/lib/duel";
import { DUEL_CONFIG_ROLES, duelErr, duelGuard } from "@/lib/duel-server";
import { resolveResultScope } from "@/lib/resultScope";

type Params = { params: Promise<{ id: string; ecId: string }> };

// PATCH { judgingMethod?: "SCORE" | "DUEL", duelConfig?: {...} }
// Back to SCORE is refused once a round is confirmed (its results would vanish).
// The bracket scope always follows the competition's result scope (result-config).
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, ecId } = await params;
  const g = await duelGuard(id, ecId, DUEL_CONFIG_ROLES);
  if ("res" in g) return g.res;
  if (g.ec.configLockedAt) return duelErr("CONFIG_LOCKED", "Konfigurasi dikunci.", 409);
  const body = await req.json().catch(() => ({}));
  const scope = resolveResultScope(g.ec, g.ec.event.scope);

  const data: { judgingMethod?: string; duelConfig?: object } = {};
  if (body.judgingMethod !== undefined) {
    if (body.judgingMethod !== "SCORE" && body.judgingMethod !== "DUEL") return duelErr("INVALID_METHOD", "Kaedah tidak sah.");
    if (body.judgingMethod === "SCORE" && g.ec.judgingMethod === "DUEL") {
      const confirmed = await db.duelRound.count({ where: { eventCompetitionId: ecId, status: { not: "DRAFT" } } });
      if (confirmed) return duelErr("DUEL_STARTED", "Duel sudah disahkan — kaedah tidak boleh ditukar ke Skor.", 409);
    }
    data.judgingMethod = body.judgingMethod;
    if (body.judgingMethod === "DUEL" && body.duelConfig === undefined) data.duelConfig = { ...g.cfg, scope };
  }
  if (body.duelConfig !== undefined) {
    const next = parseDuelConfig(body.duelConfig);
    // The format and group shape decide how rounds are built: frozen once a round is confirmed.
    if (next.format !== g.cfg.format || (next.format === "LEAGUE" && (next.groupSize !== g.cfg.groupSize || next.groupAdvance !== g.cfg.groupAdvance))) {
      const confirmed = await db.duelRound.count({ where: { eventCompetitionId: ecId, status: { not: "DRAFT" } } });
      if (confirmed) return duelErr("DUEL_STARTED", "Cabutan sudah disahkan — format dan saiz kumpulan tidak boleh ditukar.", 409);
      await db.duelRound.deleteMany({ where: { eventCompetitionId: ecId, status: "DRAFT" } });
    }
    data.duelConfig = { ...next, scope };
  }

  const ec = await db.eventCompetition.update({
    where: { id: ecId }, data, select: { judgingMethod: true, duelConfig: true },
  });
  return NextResponse.json({ judgingMethod: ec.judgingMethod, duelConfig: parseDuelConfig(ec.duelConfig) });
}
