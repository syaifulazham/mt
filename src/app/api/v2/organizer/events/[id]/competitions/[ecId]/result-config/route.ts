import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { parseDuelConfig } from "@/lib/duel";
import { resolveResultScope } from "@/lib/resultScope";

type Params = { params: Promise<{ id: string; ecId: string }> };

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

const err = (error: string, message: string, status = 400) => NextResponse.json({ error, message }, { status });

// PATCH { resultScope?: "NATIONAL" | "STATE", locked?: boolean }
// Locking freezes the judging setup (method, templates, duel config, result
// scope). Admins lock; only a Super Admin unlocks.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return err("UNAUTHORIZED", "Sila log masuk.", 401);
  if (!WRITE_ROLES.includes(session.role)) return err("FORBIDDEN", "Tiada kebenaran.", 403);

  const { id: eventId, ecId } = await params;
  const ec = await db.eventCompetition.findFirst({
    where: { id: ecId, eventId },
    select: { id: true, resultScope: true, judgingMethod: true, duelConfig: true, configLockedAt: true, event: { select: { scope: true } } },
  });
  if (!ec) return err("NOT_FOUND", "Pertandingan tidak dijumpai.", 404);
  const body = await req.json().catch(() => ({})) as { resultScope?: unknown; locked?: unknown };

  const data: { resultScope?: string; duelConfig?: object; configLockedAt?: Date | null; configLockedBy?: string | null } = {};
  let locked = !!ec.configLockedAt;

  if (body.locked === false && locked) {
    if (session.role !== "SUPER_ADMIN") return err("FORBIDDEN", "Hanya Super Admin boleh membuka kunci konfigurasi.", 403);
    data.configLockedAt = null; data.configLockedBy = null; locked = false;
  }

  if (body.resultScope !== undefined) {
    if (body.resultScope !== "NATIONAL" && body.resultScope !== "STATE") return err("INVALID_SCOPE", "Skop keputusan tidak sah.");
    const current = resolveResultScope(ec, ec.event.scope);
    if (body.resultScope !== current || ec.resultScope === null) {
      if (locked) return err("CONFIG_LOCKED", "Konfigurasi dikunci.", 409);
      // A duel's brackets follow the result scope, so it can't change after a draw.
      if (ec.judgingMethod === "DUEL" && body.resultScope !== current
        && await db.duelRound.count({ where: { eventCompetitionId: ecId } }))
        return err("SCOPE_LOCKED", "Skop tidak boleh ditukar selepas cabutan duel dibuat. Buang draf/pusingan dahulu.", 409);
      data.resultScope = body.resultScope;
      if (ec.duelConfig !== null || ec.judgingMethod === "DUEL")
        data.duelConfig = { ...parseDuelConfig(ec.duelConfig), scope: body.resultScope };
    }
  }

  if (body.locked === true && !locked) {
    data.configLockedAt = new Date(); data.configLockedBy = session.name ?? session.email ?? session.id;
  }

  const out = await db.eventCompetition.update({
    where: { id: ecId }, data,
    select: { resultScope: true, judgingMethod: true, duelConfig: true, configLockedAt: true, configLockedBy: true },
  });
  return NextResponse.json({
    resultScope: resolveResultScope(out, ec.event.scope),
    duelConfig: out.duelConfig === null ? null : parseDuelConfig(out.duelConfig),
    configLockedAt: out.configLockedAt,
    configLockedBy: out.configLockedBy,
  });
}
