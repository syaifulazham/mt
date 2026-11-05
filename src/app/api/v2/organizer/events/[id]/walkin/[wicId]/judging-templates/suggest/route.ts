import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { resolveScorePlatform } from "@/lib/walkin-score-sync";
import { scorePlatformLabel, templateMismatch } from "@/lib/walkin-score-template";

// A judging template that can store the scores captured from this walk-in
// competition's game platform (src/lib/walkin-score-template.ts).
// GET  — check: the platform's score fields and the first suitable template.
// POST — create the platform's template (not assigned; the client then
//        assigns it through ../judging-templates, showing each step).

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];
type Params = { params: Promise<{ id: string; wicId: string }> };

async function load(eventId: string, wicId: string) {
  const r = await resolveScorePlatform(eventId, wicId);
  if ("error" in r)
    return { res: NextResponse.json({ error: r.error, ...("message" in r && { message: r.message }) }, { status: r.status }) };
  return r;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, wicId } = await params;
  const ctx = await load(id, wicId);
  if ("res" in ctx) return ctx.res;
  const { wic, provider, spec, neededTime } = ctx;

  const templates = await db.judgingTemplate.findMany({
    select: {
      id: true, name: true, code: true,
      criterions: { select: { name: true, type: true, order: true, minScore: true, maxScore: true, maxTime: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  // The platform's own template first, then any other that fits.
  templates.sort((a, b) => Number(b.code.startsWith(spec.code)) - Number(a.code.startsWith(spec.code)));
  const assigned = new Set(wic.judgingTemplates.map(t => t.judgingTemplateId));
  let match: { id: string; name: string; code: string; criteria: number } | null = null;
  let closest: { name: string; code: string; reason: string } | null = null;
  for (const t of templates) {
    const why = templateMismatch(spec, t.criterions, neededTime);
    if (!why) { match = { id: t.id, name: t.name, code: t.code, criteria: t.criterions.length }; break; }
    if (!closest && t.code.startsWith(spec.code)) closest = { name: t.name, code: t.code, reason: why };
  }

  return NextResponse.json({
    platform: scorePlatformLabel(provider),
    fields: spec.criteria.map(c => ({ name: c.name, type: c.type, minScore: c.minScore, maxScore: c.maxScore, maxTime: c.maxTime })),
    scanned: templates.length,
    match: match && { ...match, assigned: assigned.has(match.id) },
    closest,
  });
}

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id, wicId } = await params;
  const ctx = await load(id, wicId);
  if ("res" in ctx) return ctx.res;
  const { spec } = ctx;

  // The platform code, or CODE-2, CODE-3… when it is taken by a template that
  // no longer fits (e.g. edited by hand).
  const taken = new Set((await db.judgingTemplate.findMany({
    where: { code: { startsWith: spec.code } }, select: { code: true },
  })).map(t => t.code));
  let code = spec.code;
  for (let n = 2; taken.has(code); n++) code = `${spec.code}-${n}`;

  const template = await db.judgingTemplate.create({
    data: {
      name: code === spec.code ? spec.name : `${spec.name} (${code.slice(spec.code.length + 1)})`,
      code,
      description: spec.description,
      criterions: {
        create: spec.criteria.map((c, i) => ({
          name: c.name, order: i, type: c.type,
          minScore: c.minScore ?? null, maxScore: c.maxScore ?? null, maxTime: c.maxTime ?? null,
        })),
      },
    },
    select: { id: true, name: true, code: true, description: true, _count: { select: { criterions: true } } },
  });
  console.warn(`[judging] ${session.name || session.email} created score template ${code} for walk-in ${wicId}`);
  return NextResponse.json({ template }, { status: 201 });
}
