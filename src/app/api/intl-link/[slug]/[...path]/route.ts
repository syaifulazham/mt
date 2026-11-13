import { NextRequest, NextResponse } from "next/server";
import { asInternationalLink, authInternationalLink } from "@/lib/international-link";
import * as overview from "@/app/api/v2/organizer/events/[id]/international/route";
import * as countries from "@/app/api/v2/organizer/events/[id]/international/countries/route";
import * as contingents from "@/app/api/v2/organizer/events/[id]/international/contingents/route";
import * as contingent from "@/app/api/v2/organizer/events/[id]/international/contingents/[cid]/route";
import * as participants from "@/app/api/v2/organizer/events/[id]/international/contingents/[cid]/participants/route";
import * as participantsBulk from "@/app/api/v2/organizer/events/[id]/international/contingents/[cid]/participants/bulk/route";
import * as participant from "@/app/api/v2/organizer/events/[id]/international/contingents/[cid]/participants/[pid]/route";
import * as trainers from "@/app/api/v2/organizer/events/[id]/international/contingents/[cid]/trainers/route";
import * as trainer from "@/app/api/v2/organizer/events/[id]/international/contingents/[cid]/trainers/[trid]/route";
import * as teams from "@/app/api/v2/organizer/events/[id]/international/contingents/[cid]/teams/route";
import * as team from "@/app/api/v2/organizer/events/[id]/international/contingents/[cid]/teams/[tid]/route";
import * as enroll from "@/app/api/v2/organizer/events/[id]/international/contingents/[cid]/teams/[tid]/enroll/route";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Mod = Partial<Record<"GET" | "POST" | "PATCH" | "DELETE", Handler>>;
const m = (x: unknown) => x as Mod;

// /api/intl-link/<slug>/international/… mirrors /api/v2/organizer/events/<id>/international/…
// for the link's own event (src/lib/international-link.ts). Link management and
// acceptance are not here, so a link can never reach them.
const ID = "([\\w-]+)";
const ROUTES: [RegExp, Mod, string[]][] = [
  [/^international$/, m(overview), []],
  [/^international\/countries$/, m(countries), []],
  [/^international\/contingents$/, m(contingents), []],
  [new RegExp(`^international/contingents/${ID}$`), m(contingent), ["cid"]],
  [new RegExp(`^international/contingents/${ID}/participants$`), m(participants), ["cid"]],
  [new RegExp(`^international/contingents/${ID}/participants/bulk$`), m(participantsBulk), ["cid"]],
  [new RegExp(`^international/contingents/${ID}/participants/${ID}$`), m(participant), ["cid", "pid"]],
  [new RegExp(`^international/contingents/${ID}/trainers$`), m(trainers), ["cid"]],
  [new RegExp(`^international/contingents/${ID}/trainers/${ID}$`), m(trainer), ["cid", "trid"]],
  [new RegExp(`^international/contingents/${ID}/teams$`), m(teams), ["cid"]],
  [new RegExp(`^international/contingents/${ID}/teams/${ID}$`), m(team), ["cid", "tid"]],
  [new RegExp(`^international/contingents/${ID}/teams/${ID}/enroll$`), m(enroll), ["cid", "tid"]],
];

type Ctx = { params: Promise<{ slug: string; path: string[] }> };

async function dispatch(method: "GET" | "POST" | "PATCH" | "DELETE", req: NextRequest, { params }: Ctx) {
  const { slug, path } = await params;
  const a = await authInternationalLink(req, slug);
  if ("res" in a) return a.res;
  const p = path.join("/");
  const hit = ROUTES.find(([re]) => re.test(p));
  const handler = hit?.[1][method];
  if (!hit || !handler) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const match = p.match(hit[0])!;
  const routeParams: Record<string, string> = { id: a.link.eventId };
  hit[2].forEach((k, i) => { routeParams[k] = match[i + 1]; });
  return asInternationalLink(a.who, () => handler(req, { params: Promise.resolve(routeParams) }));
}

export const GET = (req: NextRequest, ctx: Ctx) => dispatch("GET", req, ctx);
export const POST = (req: NextRequest, ctx: Ctx) => dispatch("POST", req, ctx);
export const PATCH = (req: NextRequest, ctx: Ctx) => dispatch("PATCH", req, ctx);
export const DELETE = (req: NextRequest, ctx: Ctx) => dispatch("DELETE", req, ctx);
