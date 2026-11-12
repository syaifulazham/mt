import { NextRequest, NextResponse } from "next/server";
import { asDuelEndpoint, authDuelControl } from "@/lib/duel-control";
import * as state from "@/app/api/v2/organizer/events/[id]/competitions/[ecId]/duel/route";
import * as rounds from "@/app/api/v2/organizer/events/[id]/competitions/[ecId]/duel/rounds/route";
import * as round from "@/app/api/v2/organizer/events/[id]/competitions/[ecId]/duel/rounds/[rid]/route";
import * as confirm from "@/app/api/v2/organizer/events/[id]/competitions/[ecId]/duel/rounds/[rid]/confirm/route";
import * as startAll from "@/app/api/v2/organizer/events/[id]/competitions/[ecId]/duel/rounds/[rid]/start-all/route";
import * as scorecardLink from "@/app/api/v2/organizer/events/[id]/competitions/[ecId]/duel/sessions/[sid]/scorecard-link/route";
import * as control from "@/app/api/v2/organizer/events/[id]/competitions/[ecId]/duel/sessions/[sid]/control/route";
import * as ranks from "@/app/api/v2/organizer/events/[id]/competitions/[ecId]/duel/sessions/[sid]/ranks/route";

export const dynamic = "force-dynamic";

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Mod = Partial<Record<"GET" | "POST" | "PATCH" | "DELETE", Handler>>;

// /api/duel-control/<slug>/duel/… mirrors /api/v2/organizer/events/<id>/competitions/<ecId>/duel/…
// for the link's own competition, with the link's access level (src/lib/duel-control.ts).
const ROUTES: [RegExp, Mod, string[]][] = [
  [/^duel$/, state as unknown as Mod, []],
  [/^duel\/rounds$/, rounds as unknown as Mod, []],
  [/^duel\/rounds\/([\w-]+)$/, round as unknown as Mod, ["rid"]],
  [/^duel\/rounds\/([\w-]+)\/confirm$/, confirm as unknown as Mod, ["rid"]],
  [/^duel\/rounds\/([\w-]+)\/start-all$/, startAll as unknown as Mod, ["rid"]],
  [/^duel\/sessions\/([\w-]+)\/scorecard-link$/, scorecardLink as unknown as Mod, ["sid"]],
  [/^duel\/sessions\/([\w-]+)\/control$/, control as unknown as Mod, ["sid"]],
  [/^duel\/sessions\/([\w-]+)\/ranks$/, ranks as unknown as Mod, ["sid"]],
];

async function dispatch(method: "GET" | "POST" | "PATCH" | "DELETE", req: NextRequest, { params }: { params: Promise<{ slug: string; path: string[] }> }) {
  const { slug, path } = await params;
  const a = await authDuelControl(req, slug);
  if ("res" in a) return a.res;
  const p = path.join("/");
  const hit = ROUTES.find(([re]) => re.test(p));
  const handler = hit?.[1][method];
  if (!hit || !handler) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const m = p.match(hit[0])!;
  const routeParams: Record<string, string> = { id: a.ep.eventCompetition.eventId, ecId: a.ep.eventCompetitionId };
  hit[2].forEach((k, i) => { routeParams[k] = m[i + 1]; });
  return asDuelEndpoint(a.who, () => handler(req, { params: Promise.resolve(routeParams) }));
}

export const GET = (req: NextRequest, ctx: { params: Promise<{ slug: string; path: string[] }> }) => dispatch("GET", req, ctx);
export const POST = (req: NextRequest, ctx: { params: Promise<{ slug: string; path: string[] }> }) => dispatch("POST", req, ctx);
export const PATCH = (req: NextRequest, ctx: { params: Promise<{ slug: string; path: string[] }> }) => dispatch("PATCH", req, ctx);
export const DELETE = (req: NextRequest, ctx: { params: Promise<{ slug: string; path: string[] }> }) => dispatch("DELETE", req, ctx);
