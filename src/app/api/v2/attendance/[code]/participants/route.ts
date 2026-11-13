import { NextRequest, NextResponse } from "next/server";
import { onsiteOnly } from "@/lib/onlineCompetition";
import { db } from "@/lib/db";
import { wildcardMatcher } from "@/lib/wildcardFilter";

const MAX_ROWS = 100;

/**
 * GET /api/v2/attendance/[code]/participants?passcode=&q=
 * Competition counter, manual mode: participants of accepted teams in this
 * event matching `q` on contingent (name / short name), team, participant name
 * or IC. Plain text matches anywhere; * and ? make it a wildcard pattern over
 * the whole value (e.g. "*ali*", "0105??-*"). One row per participant per team,
 * with whether they are already recorded present. ICs are returned masked.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const passcode = req.nextUrl.searchParams.get("passcode") ?? "";
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);

  const endpoint = await db.attendanceEndpoint.findUnique({
    where: { routeCode: code }, select: { passcode: true, active: true, eventId: true },
  });
  if (!endpoint) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!endpoint.active) return NextResponse.json({ error: "ENDPOINT_RETIRED" }, { status: 410 });
  if (passcode !== endpoint.passcode) return NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 403 });

  // The longest plain run narrows the database query; the matcher then decides.
  const fragment = q.split(/[*?]+/).sort((a, b) => b.length - a.length)[0]?.trim() ?? "";
  if (fragment.length < 2) return NextResponse.json({ rows: [], truncated: false, tooShort: true });
  const digits = fragment.replace(/\D/g, "");

  const contains = { contains: fragment, mode: "insensitive" as const };
  const teamEvents = await db.teamEvent.findMany({
    where: {
      ...onsiteOnly(endpoint.eventId),
      eventId: endpoint.eventId,
      acceptance: "ACCEPT",
      OR: [
        { team: { name: contains } },
        { team: { contingent: { name: contains } } },
        { team: { contingent: { shortName: contains } } },
        { team: { members: { some: { participant: { name: contains } } } } },
        ...(digits.length >= 3 ? [{ team: { members: { some: { participant: { ic: { contains: digits } } } } } }] : []),
        { team: { members: { some: { participant: { ic: contains } } } } },
      ],
    },
    select: {
      id: true,
      team: {
        select: {
          name: true,
          competition: { select: { code: true, name: true } },
          contingent: {
            select: {
              name: true, shortName: true,
              state: { select: { name: true } }, school: { select: { state: { select: { name: true } } } },
            },
          },
          members: { select: { participant: { select: { id: true, name: true, ic: true } } } },
        },
      },
      participantAttendance: { select: { participantId: true, attendedAt: true } },
    },
    take: 300,
  });

  const match = wildcardMatcher(q);
  const rows = teamEvents.flatMap(te => {
    const c = te.team.contingent;
    const teamHit = [te.team.name, c.name, c.shortName ?? ""].some(match);
    const present = new Map(te.participantAttendance.map(a => [a.participantId, a.attendedAt]));
    return te.team.members
      .filter(({ participant: p }) => {
        if (teamHit) return true;
        const ic = p.ic ?? "";
        return match(p.name) || (!!ic && (match(ic) || match(ic.replace(/\D/g, ""))));
      })
      .map(({ participant: p }) => ({
        teamEventId: te.id,
        participantId: p.id,
        name: p.name,
        icTail: p.ic ? p.ic.replace(/\D/g, "").slice(-4) : null,
        teamName: te.team.name,
        competitionCode: te.team.competition.code,
        competitionName: te.team.competition.name,
        contingentName: c.name,
        contingentShortName: c.shortName,
        state: c.state?.name ?? c.school?.state?.name ?? null,
        attendedAt: present.get(p.id)?.toISOString() ?? null,
      }));
  });
  rows.sort((a, b) =>
    a.contingentName.localeCompare(b.contingentName) || a.teamName.localeCompare(b.teamName) || a.name.localeCompare(b.name));

  return NextResponse.json({ rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS, tooShort: false });
}
