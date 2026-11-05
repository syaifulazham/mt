import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  confirmCounterSubmission, loadCounterWic, previewCounterSubmission,
  registerExistingTeam, registerNewTeam, searchCounterTeams,
} from "@/lib/walkin-counter-team";

// Team competitions at the walk-in counter. The work lives in
// src/lib/walkin-counter-team.ts.

async function resolve(slug: string, passcode: unknown, competitionId: unknown) {
  const endpoint = await db.walkInEndpoint.findUnique({
    where: { routeSlug: slug },
    select: { passcode: true, active: true, walkInCompetitionId: true, eventId: true },
  });
  if (!endpoint || !endpoint.active) return { res: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }) };
  if (!endpoint.passcode || endpoint.passcode !== passcode)
    return { res: NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 403 }) };
  const wicId = endpoint.walkInCompetitionId ?? (typeof competitionId === "string" ? competitionId : null);
  if (!wicId) return { res: NextResponse.json({ error: "MISSING_COMPETITION" }, { status: 400 }) };
  const wic = await loadCounterWic(endpoint.eventId, wicId);
  if (!wic) return { res: NextResponse.json({ error: "COMPETITION_NOT_FOUND" }, { status: 404 }) };
  if (wic.competition.participationType !== "TEAM")
    return { res: NextResponse.json({ error: "NOT_A_TEAM_COMPETITION" }, { status: 400 }) };
  return { eventId: endpoint.eventId, wic };
}

const fail = (r: { error: string; detail?: string; status: number }) =>
  NextResponse.json({ error: r.error, detail: r.detail }, { status: r.status });

// GET ?passcode&competitionId&q — pending team entries and teams matching
//     a team name or a member's name/IC.
// GET ?passcode&competitionId&submissionId — what verifying that entry would do.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sp = req.nextUrl.searchParams;
  const ctx = await resolve(slug, sp.get("passcode"), sp.get("competitionId"));
  if ("res" in ctx) return ctx.res;

  const submissionId = sp.get("submissionId");
  if (submissionId) {
    const r = await previewCounterSubmission(ctx.eventId, ctx.wic, submissionId);
    return "error" in r ? fail(r) : NextResponse.json({ data: r.preview });
  }
  const q = sp.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ data: { submissions: [], teams: [] } });
  return NextResponse.json({ data: await searchCounterTeams(ctx.eventId, ctx.wic, q) });
}

// POST { passcode, competitionId, action, ... }
//   action "confirm_submission" { submissionId }
//   action "register_team"      { teamId, sessionNumber?, slotNumber? }
//   action "new_team"           { teamName, ics: string[], sessionNumber?, slotNumber? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const ctx = await resolve(slug, body.passcode, body.competitionId);
  if ("res" in ctx) return ctx.res;
  const { eventId, wic } = ctx;

  let r;
  if (body.action === "confirm_submission" && typeof body.submissionId === "string")
    r = await confirmCounterSubmission(eventId, wic, body.submissionId);
  else if (body.action === "register_team" && typeof body.teamId === "string")
    r = await registerExistingTeam(eventId, wic, body.teamId, body.sessionNumber, body.slotNumber);
  else if (body.action === "new_team")
    r = await registerNewTeam(eventId, wic, body);
  else return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });

  return "error" in r ? fail(r) : NextResponse.json({ data: r.result }, { status: 201 });
}
