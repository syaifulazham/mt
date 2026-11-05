import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DUEL_CONTROL_ROLES, duelErr, duelGuard, loadDuelSession } from "@/lib/duel-server";

type Params = { params: Promise<{ id: string; ecId: string; sid: string }> };

// POST { action: start | pause | resume | end | reset | arena, arena? }
// An arena runs one session at a time. `reset` (Super Admin) puts the clock
// back to the start; `arena` moves a session that has not started.
export async function POST(req: NextRequest, { params }: Params) {
  const { id, ecId, sid } = await params;
  const g = await duelGuard(id, ecId, DUEL_CONTROL_ROLES);
  if ("res" in g) return g.res;
  const s = await loadDuelSession(ecId, sid);
  if (!s) return duelErr("NOT_FOUND", "Sesi tidak dijumpai.", 404);
  if (s.round.status === "DRAFT") return duelErr("NOT_CONFIRMED", "Sahkan cabutan dahulu.", 409);

  const { action, arena } = await req.json().catch(() => ({}));
  const now = new Date();
  let data: Record<string, unknown>;

  switch (action) {
    case "start": {
      if (s.status !== "PENDING") return duelErr("BAD_STATE", "Sesi ini sudah bermula.", 409);
      const busy = await db.duelSession.findFirst({
        where: { id: { not: s.id }, arena: s.arena, status: { in: ["RUNNING", "PAUSED"] }, round: { eventCompetitionId: ecId } },
        select: { label: true, round: { select: { number: true, groupKey: true } } },
      });
      if (busy) {
        const state = busy.round.groupKey
          ? (await db.state.findUnique({ where: { id: busy.round.groupKey }, select: { name: true } }))?.name : null;
        return duelErr("ARENA_BUSY", `Arena ${s.arena} masih menjalankan sesi ${busy.label}${state ? ` (${state})` : ""}. Tamatkan dahulu.`, 409);
      }
      data = { status: "RUNNING", startedAt: now, pausedAt: null, pausedMs: 0, endedAt: null };
      break;
    }
    case "pause":
      if (s.status !== "RUNNING") return duelErr("BAD_STATE", "Sesi tidak sedang berjalan.", 409);
      data = { status: "PAUSED", pausedAt: now };
      break;
    case "resume":
      if (s.status !== "PAUSED" || !s.pausedAt) return duelErr("BAD_STATE", "Sesi tidak dijeda.", 409);
      data = { status: "RUNNING", pausedAt: null, pausedMs: s.pausedMs + (now.getTime() - s.pausedAt.getTime()) };
      break;
    case "end":
      if (s.status !== "RUNNING" && s.status !== "PAUSED") return duelErr("BAD_STATE", "Sesi tidak sedang berjalan.", 409);
      data = {
        status: "ENDED", endedAt: now, pausedAt: null,
        pausedMs: s.pausedAt ? s.pausedMs + (now.getTime() - s.pausedAt.getTime()) : s.pausedMs,
      };
      break;
    case "reset":
      if (g.session.role !== "SUPER_ADMIN") return duelErr("FORBIDDEN", "Hanya Super Admin boleh set semula masa.", 403);
      if (s.status === "DONE") return duelErr("BAD_STATE", "Sesi sudah diberi kedudukan.", 409);
      data = { status: "PENDING", startedAt: null, pausedAt: null, pausedMs: 0, endedAt: null };
      break;
    case "arena": {
      const a = Math.round(Number(arena));
      if (!(a >= 1 && a <= 50)) return duelErr("BAD_ARENA", "Arena tidak sah.");
      if (s.status !== "PENDING") return duelErr("BAD_STATE", "Hanya sesi yang belum bermula boleh ditukar arena.", 409);
      data = { arena: a };
      break;
    }
    default:
      return duelErr("BAD_ACTION", "Tindakan tidak sah.");
  }

  await db.duelSession.update({ where: { id: s.id }, data });
  return NextResponse.json({ ok: true });
}
