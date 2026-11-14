import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { eligibleCompetitions, loadPreregEvent, PARTICIPANT_SELECT, stateOf } from "@/lib/prereg-individual";

const WILDCARD_ROLES: string[] = ["SUPER_ADMIN"];

/**
 * GET ?q=&wildcard=1 — participants (name, IC / passport or contingent) who
 * could be entered in the event's individual competitions, each with the
 * competitions they are eligible for and those they are already in. Without
 * `wildcard` only contingents inside the event's state / zone.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id: eventId } = await params;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const wildcard = req.nextUrl.searchParams.get("wildcard") === "1";
  if (wildcard && !WILDCARD_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const ev = await loadPreregEvent(eventId);
  if (!ev) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  // The event's individual competitions, so the dialog knows what it can offer.
  const competitions = ev.individual.map(({ id, code, name }) => ({ id, code, name }));
  if (q.length < 2 || competitions.length === 0) return NextResponse.json({ data: [], competitions });

  const digits = q.replace(/\D/g, "");
  const found = await db.participant.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { contingent: { name: { contains: q, mode: "insensitive" } } },
        { passport: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 4 ? [{ ic: { contains: digits } }] : []),
      ],
    },
    select: { ...PARTICIPANT_SELECT, teamMembers: { select: { team: { select: { competitionId: true, teamEvents: { where: { eventId }, select: { id: true } } } } } } },
    orderBy: { name: "asc" },
    take: 120,
  });

  const data = found
    .filter((p) => wildcard || ev.inScope(stateOf(p)?.id ?? null))
    .map((p) => {
      const entered = new Set(p.teamMembers.filter((m) => m.team.teamEvents.length).map((m) => m.team.competitionId));
      const comps = eligibleCompetitions(ev, p);
      return {
        id: p.id, name: p.name,
        idNo: p.ic ? `${p.ic.slice(0, 6)}••••${p.ic.slice(-2)}` : p.passport ?? null,
        eduLevel: p.eduLevel, classGrade: p.classGrade,
        contingentName: p.contingent?.name ?? null,
        stateName: stateOf(p)?.name ?? p.contingent?.country?.name ?? null,
        competitions: comps.map((c) => ({ id: c.id, code: c.code, name: c.name, entered: entered.has(c.id) })),
      };
    })
    .filter((p) => p.competitions.length > 0)
    .slice(0, 50);

  return NextResponse.json({ data, competitions });
}
