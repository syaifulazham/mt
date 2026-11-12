import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { duelTeams } from "@/lib/duel-server";
import { resolveResultScope } from "@/lib/resultScope";
import { mergeApplies, mergeLockReason } from "@/lib/team-merge-server";

type Params = { params: Promise<{ id: string; ecId: string }> };

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const err = (error: string, message: string, status = 400) => NextResponse.json({ error, message }, { status });

async function guard(params: Params["params"], write: boolean) {
  const session = await getOrganizerSession();
  if (!session) return { res: err("UNAUTHORIZED", "Sila log masuk.", 401) };
  if (write && !WRITE_ROLES.includes(session.role)) return { res: err("FORBIDDEN", "Tiada kebenaran.", 403) };
  const { id: eventId, ecId } = await params;
  const ec = await db.eventCompetition.findFirst({
    where: { id: ecId, eventId },
    select: {
      id: true, eventId: true, competitionId: true, mergeByState: true, mergeMax: true,
      resultScope: true, judgingMethod: true, duelConfig: true, configLockedAt: true,
      event: { select: { scope: true } },
    },
  });
  if (!ec) return { res: err("NOT_FOUND", "Pertandingan tidak dijumpai.", 404) };
  return { ec, national: resolveResultScope(ec, String(ec.event.scope)) !== "STATE" };
}

// GET — merged state teams of a competition (any judging method): the setting,
// every registered team (unmerged) and the saved merges.
export async function GET(_req: NextRequest, { params }: Params) {
  const g = await guard(params, false);
  if ("res" in g) return g.res;
  const { ec } = g;
  const [teams, merges, lockReason] = await Promise.all([
    duelTeams(ec.eventId, ec.competitionId),
    db.teamMerge.findMany({
      where: { eventCompetitionId: ec.id }, orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, name: true, stateId: true, teamIds: true },
    }),
    mergeLockReason(ec.id),
  ]);
  return NextResponse.json({
    enabled: ec.mergeByState, applies: mergeApplies(ec, String(ec.event.scope)), national: g.national,
    max: ec.mergeMax, locked: !!lockReason, lockReason, teams, merges,
  });
}

// PATCH { mergeByState?, mergeMax? } — the setting. National results only; the
// on/off switch is frozen once judging has started (see mergeLockReason).
export async function PATCH(req: NextRequest, { params }: Params) {
  const g = await guard(params, true);
  if ("res" in g) return g.res;
  const { ec } = g;
  if (ec.configLockedAt) return err("CONFIG_LOCKED", "Konfigurasi dikunci.", 409);
  const body = await req.json().catch(() => ({})) as { mergeByState?: unknown; mergeMax?: unknown };
  const data: { mergeByState?: boolean; mergeMax?: number } = {};
  if (body.mergeByState !== undefined) {
    const on = body.mergeByState === true;
    if (on && !g.national) return err("STATE_RESULTS", "Gabungan negeri hanya untuk keputusan Kebangsaan.");
    if (on !== ec.mergeByState) {
      const reason = await mergeLockReason(ec.id);
      if (reason) return err("MERGE_LOCKED", reason, 409);
      // A draft duel draw holds the teams as they were.
      await db.duelRound.deleteMany({ where: { eventCompetitionId: ec.id, status: "DRAFT" } });
    }
    data.mergeByState = on;
  }
  if (body.mergeMax !== undefined) {
    const n = Number(body.mergeMax);
    if (!Number.isInteger(n) || n < 1 || n > 32) return err("INVALID_MAX", "Pasukan maks / gabungan antara 1 dan 32.");
    const biggest = await db.teamMerge.findMany({ where: { eventCompetitionId: ec.id }, select: { name: true, teamIds: true } });
    const over = biggest.find(m => m.teamIds.length > n);
    if (over) return err("MERGE_TOO_BIG", `${over.name} sudah mempunyai ${over.teamIds.length} pasukan — susun semula gabungan dahulu.`, 409);
    data.mergeMax = n;
  }
  const saved = await db.eventCompetition.update({ where: { id: ec.id }, data, select: { mergeByState: true, mergeMax: true } });
  return NextResponse.json(saved);
}

// PUT { groups: [{ name, stateId?, teamIds }] } — replace every merge. The first
// team of a group is its lead (the id its scores and duel entries carry).
// Frozen once judging has started; a draft duel draw is discarded.
export async function PUT(req: NextRequest, { params }: Params) {
  const g = await guard(params, true);
  if ("res" in g) return g.res;
  const { ec } = g;
  if (!ec.mergeByState) return err("MERGE_OFF", "Gabungan negeri tidak diaktifkan untuk pertandingan ini.");
  const reason = await mergeLockReason(ec.id);
  if (reason) return err("MERGE_LOCKED", reason, 409);

  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.groups)) return err("INVALID", "Senarai gabungan tidak sah.");
  const pool = new Set((await duelTeams(ec.eventId, ec.competitionId)).map(t => t.id));
  const seen = new Set<string>();
  const groups: { name: string; stateId: string | null; teamIds: string[] }[] = [];
  for (const raw of body.groups as unknown[]) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const name = String(o.name ?? "").trim().slice(0, 60);
    const teamIds = Array.isArray(o.teamIds) ? o.teamIds.map(String) : [];
    if (!teamIds.length) continue; // empty groups are dropped
    if (!name) return err("NAME_REQUIRED", "Setiap gabungan perlu nama.");
    if (teamIds.length > ec.mergeMax) return err("TOO_MANY", `${name}: melebihi ${ec.mergeMax} pasukan setiap gabungan.`);
    for (const t of teamIds) {
      if (!pool.has(t)) return err("UNKNOWN_TEAM", `${name}: pasukan tidak berdaftar untuk pertandingan ini.`);
      if (seen.has(t)) return err("DUPLICATE_TEAM", `${name}: pasukan sudah dalam gabungan lain.`);
      seen.add(t);
    }
    groups.push({ name, stateId: typeof o.stateId === "string" && o.stateId ? o.stateId : null, teamIds });
  }
  const names = groups.map(x => x.name.toUpperCase());
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) return err("DUPLICATE_NAME", `Nama gabungan berulang: ${dup}.`);

  await db.$transaction([
    db.duelRound.deleteMany({ where: { eventCompetitionId: ec.id, status: "DRAFT" } }),
    db.teamMerge.deleteMany({ where: { eventCompetitionId: ec.id } }),
    db.teamMerge.createMany({ data: groups.map((x, position) => ({ eventCompetitionId: ec.id, position, ...x })) }),
  ]);
  return NextResponse.json({ ok: true, count: groups.length });
}
