import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { awardGuard } from "@/lib/special-awards-api";

type Params = { params: Promise<{ id: string }> };

// GET ?type=TEAM|INDIVIDUAL&ecId=&q= — teams or participants entered in the
// event (in the competition when ecId is given) to pick as winners; 30 at most.
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const g = await awardGuard(id, false);
  if ("res" in g) return g.res;
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const ecId = sp.get("ecId");
  const ec = ecId ? await db.eventCompetition.findFirst({ where: { id: ecId, eventId: id }, select: { competitionId: true } }) : null;
  const teamWhere = { status: "ACTIVE" as const, teamEvents: { some: { eventId: id } }, ...(ec ? { competitionId: ec.competitionId } : {}) };
  const like = { contains: q, mode: "insensitive" as const };

  if (sp.get("type") === "INDIVIDUAL") {
    const people = await db.participant.findMany({
      where: { teamMembers: { some: { team: teamWhere } }, ...(q ? { OR: [{ name: like }, { teamMembers: { some: { team: { name: like } } } }] } : {}) },
      select: {
        id: true, name: true,
        contingent: { select: { name: true } },
        teamMembers: { where: { team: teamWhere }, take: 1, select: { team: { select: { name: true, competition: { select: { code: true } } } } } },
      },
      orderBy: { name: "asc" }, take: 30,
    });
    return NextResponse.json({
      candidates: people.map(p => ({
        id: p.id, name: p.name, sub: [p.teamMembers[0]?.team.name, p.contingent?.name].filter(Boolean).join(" · "),
        code: p.teamMembers[0]?.team.competition?.code ?? null,
      })),
    });
  }
  const teams = await db.team.findMany({
    where: { ...teamWhere, ...(q ? { OR: [{ name: like }, { contingent: { name: like } }] } : {}) },
    select: { id: true, name: true, contingent: { select: { name: true } }, competition: { select: { code: true } } },
    orderBy: { name: "asc" }, take: 30,
  });
  return NextResponse.json({ candidates: teams.map(t => ({ id: t.id, name: t.name, sub: t.contingent.name, code: t.competition?.code ?? null })) });
}
