import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { cleanSplitLabel, SPLIT_LABEL_MAX } from "@/lib/competition-split";

type Params = { params: Promise<{ id: string; ecId: string }> };

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const err = (error: string, message: string, status = 400) => NextResponse.json({ error, message }, { status });
const BAD_LABEL = `Label pecahan diperlukan (maks ${SPLIT_LABEL_MAX} aksara).`;
const DUP_LABEL = "Label ini sudah digunakan oleh pecahan lain pertandingan ini.";

async function guard(params: Params["params"]) {
  const session = await getOrganizerSession();
  if (!session) return { res: err("UNAUTHORIZED", "Sila log masuk.", 401) };
  if (!WRITE_ROLES.includes(session.role)) return { res: err("FORBIDDEN", "Tiada kebenaran.", 403) };
  const { id: eventId, ecId } = await params;
  const ec = await db.eventCompetition.findFirst({
    where: { id: ecId, eventId },
    select: { id: true, eventId: true, competitionId: true, splitLabel: true, parentId: true, resultScope: true, countInMedals: true },
  });
  if (!ec) return { res: err("NOT_FOUND", "Pertandingan tidak dijumpai.", 404) };
  return { ec };
}

/** Another split of the same competition already has this label (case and spacing aside). */
async function labelTaken(ec: { id: string; eventId: string; competitionId: string }, label: string) {
  const rows = await db.eventCompetition.findMany({
    where: { eventId: ec.eventId, competitionId: ec.competitionId, id: { not: ec.id } }, select: { splitLabel: true },
  });
  return rows.some(r => r.splitLabel.toLowerCase() === label.toLowerCase());
}

const isDup = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// POST { label, originalLabel? } — split the competition: add a judging split
// with its own setup (method, templates, tasks, results), sharing the
// competition's registered teams. The first time, the original gets
// `originalLabel` and becomes split 1 — its setup, tasks and scores stay put.
export async function POST(req: NextRequest, { params }: Params) {
  const g = await guard(params);
  if ("res" in g) return g.res;
  const body = await req.json().catch(() => ({})) as { label?: unknown; originalLabel?: unknown };
  const label = cleanSplitLabel(body.label);
  if (!label) return err("LABEL_REQUIRED", BAD_LABEL);
  const root = g.ec.parentId
    ? (await db.eventCompetition.findUnique({ where: { id: g.ec.parentId }, select: { id: true, splitLabel: true, resultScope: true } }))!
    : g.ec;
  let originalLabel: string | null = null;
  if (!root.splitLabel) {
    originalLabel = cleanSplitLabel(body.originalLabel);
    if (!originalLabel) return err("ORIGINAL_LABEL_REQUIRED", `Beri label bagi bahagian sedia ada (maks ${SPLIT_LABEL_MAX} aksara).`);
    if (originalLabel.toLowerCase() === label.toLowerCase()) return err("DUPLICATE_LABEL", DUP_LABEL);
  }
  if (await labelTaken({ ...g.ec, id: "" }, label)) return err("DUPLICATE_LABEL", DUP_LABEL, 409);
  try {
    const created = await db.$transaction(async tx => {
      if (originalLabel) await tx.eventCompetition.update({ where: { id: root.id }, data: { splitLabel: originalLabel } });
      return tx.eventCompetition.create({
        data: {
          eventId: g.ec.eventId, competitionId: g.ec.competitionId, parentId: root.id, splitLabel: label,
          // Ranked the same way as the original until changed.
          resultScope: root.resultScope,
        },
        select: { id: true },
      });
    });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    if (isDup(e)) return err("DUPLICATE_LABEL", DUP_LABEL, 409);
    throw e;
  }
}

// PATCH { splitLabel?, countInMedals? } — rename a split, or switch whether its
// results feed the Medal Tally. The original can drop its label only once it
// has no splits left.
export async function PATCH(req: NextRequest, { params }: Params) {
  const g = await guard(params);
  if ("res" in g) return g.res;
  const body = await req.json().catch(() => ({})) as { splitLabel?: unknown; countInMedals?: unknown };
  const data: { splitLabel?: string; countInMedals?: boolean } = {};
  if (body.splitLabel !== undefined) {
    const raw = String(body.splitLabel ?? "").trim();
    if (!raw) {
      if (g.ec.parentId) return err("LABEL_REQUIRED", BAD_LABEL);
      if (await db.eventCompetition.count({ where: { parentId: g.ec.id } })) return err("HAS_SPLITS", "Padam pecahan lain dahulu sebelum membuang label ini.", 409);
      data.splitLabel = "";
    } else {
      const label = cleanSplitLabel(raw);
      if (!label) return err("LABEL_REQUIRED", BAD_LABEL);
      if (await labelTaken(g.ec, label)) return err("DUPLICATE_LABEL", DUP_LABEL, 409);
      data.splitLabel = label;
    }
  }
  if (body.countInMedals !== undefined) data.countInMedals = body.countInMedals === true;
  try {
    const out = await db.eventCompetition.update({ where: { id: g.ec.id }, data, select: { splitLabel: true, countInMedals: true } });
    return NextResponse.json(out);
  } catch (e) {
    if (isDup(e)) return err("DUPLICATE_LABEL", DUP_LABEL, 409);
    throw e;
  }
}

// DELETE — remove an added split. Refused while it has judging tasks or duel
// rounds (their scores would go with it); the original can't be removed here.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const g = await guard(params);
  if ("res" in g) return g.res;
  if (!g.ec.parentId) return err("ORIGINAL", "Bahagian asal tidak boleh dipadam — padam pecahan tambahan sahaja.", 409);
  const [tasks, rounds, awards] = await Promise.all([
    db.judgingTask.count({ where: { eventCompetitionId: g.ec.id } }),
    db.duelRound.count({ where: { eventCompetitionId: g.ec.id } }),
    db.specialAward.count({ where: { eventCompetitionId: g.ec.id } }),
  ]);
  if (tasks || rounds) return err("IN_USE", "Pecahan ini mempunyai tugas penghakiman atau pusingan duel — padam dahulu.", 409);
  if (awards) return err("IN_USE", "Pecahan ini digunakan oleh Anugerah Tambahan — ubah atau padam anugerah itu dahulu.", 409);
  await db.eventCompetition.delete({ where: { id: g.ec.id } });
  return NextResponse.json({ ok: true });
}
