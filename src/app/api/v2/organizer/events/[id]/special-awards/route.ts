import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { competitionTitle } from "@/lib/competition-split";
import { loadSpecialAwards } from "@/lib/special-awards";
import { awardGuard, parseAwardInput } from "@/lib/special-awards-api";

type Params = { params: Promise<{ id: string }> };

// GET — the event's special awards (winners resolved) and the form's options:
// each competition with its assigned judging templates.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const g = await awardGuard(id, false);
  if ("res" in g) return g.res;
  const [awards, ecs] = await Promise.all([
    loadSpecialAwards(id),
    db.eventCompetition.findMany({
      where: { eventId: id },
      select: {
        id: true, judgingMethod: true, splitLabel: true,
        competition: { select: { code: true, name: true, participationType: true } },
        judgingTemplates: { select: { judgingTemplate: { select: { id: true, name: true, code: true } } } },
      },
    }),
  ]);
  const competitions = ecs
    .map(ec => ({
      id: ec.id, code: ec.competition.code, name: competitionTitle(ec.competition.name, ec.splitLabel), participationType: ec.competition.participationType,
      judgingMethod: ec.judgingMethod, templates: ec.judgingTemplates.map(t => t.judgingTemplate),
    }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  return NextResponse.json({ awards, competitions });
}

// POST — create an award (see parseAwardInput).
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const g = await awardGuard(id, true);
  if ("res" in g) return g.res;
  const parsed = await parseAwardInput(id, await req.json().catch(() => ({})));
  if ("res" in parsed) return parsed.res;
  const position = await db.specialAward.count({ where: { eventId: id } });
  const award = await db.specialAward.create({
    data: { eventId: id, ...parsed.data, position, createdBy: g.session.name ?? g.session.email ?? g.session.id },
    select: { id: true },
  });
  return NextResponse.json({ id: award.id }, { status: 201 });
}
