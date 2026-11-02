import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { GENERATOR_SOURCES, resolveRecipients, type GeneratorConfig, type GeneratorSource } from "@/lib/certificates/generator";

export const dynamic = "force-dynamic";
const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

/**
 * GET            — generator jobs, publishable templates and events
 * GET ?eventId=X — that event's competitions (regular + walk-in), for the filter
 */
export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const eventId = req.nextUrl.searchParams.get("eventId");
  if (eventId) {
    const [regular, walkIn] = await Promise.all([
      db.eventCompetition.findMany({ where: { eventId }, select: { competition: { select: { code: true, name: true } } } }),
      db.eventWalkInCompetition.findMany({ where: { eventId }, select: { competition: { select: { code: true, name: true } } } }),
    ]);
    const all = new Map([...regular, ...walkIn].map(c => [c.competition.code, c.competition]));
    return NextResponse.json({ competitions: [...all.values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })) });
  }

  const [jobs, templates, events] = await Promise.all([
    db.certGeneratorJob.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    db.certTemplate.findMany({
      where:   { status: "ACTIVE", currentVersionId: { not: null }, season: { archivedAt: null } },
      select:  { id: true, name: true, targetType: true, season: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    db.event.findMany({ select: { id: true, name: true, slug: true, scope: true, startDate: true }, orderBy: { startDate: "desc" } }),
  ]);
  const tName = new Map(templates.map(t => [t.id, t.name]));
  const missing = jobs.filter(j => !tName.has(j.templateId)).map(j => j.templateId);
  if (missing.length)
    for (const t of await db.certTemplate.findMany({ where: { id: { in: missing } }, select: { id: true, name: true } })) tName.set(t.id, t.name);
  const evName = new Map(events.map(e => [e.id, e.name]));

  return NextResponse.json({
    jobs: jobs.map(j => {
      const cfg = j.config as GeneratorConfig;
      return { ...j, templateName: tName.get(j.templateId) ?? "(templat dipadam)", eventName: cfg.eventId ? evName.get(cfg.eventId) ?? null : null, config: { ...cfg, rows: undefined, rowCount: cfg.rows?.length } };
    }),
    templates, events,
  }, { headers: { "Cache-Control": "no-store" } });
}

/** POST { templateId, source, config } — create a generator job (counts its recipients). */
export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { templateId?: string; source?: string; config?: GeneratorConfig };
  if (!body.templateId || !GENERATOR_SOURCES.includes(body.source as GeneratorSource))
    return NextResponse.json({ error: "Pilih templat dan data penerima." }, { status: 400 });
  const template = await db.certTemplate.findUnique({ where: { id: body.templateId }, select: { currentVersionId: true, season: { select: { archivedAt: true } } } });
  if (!template?.currentVersionId) return NextResponse.json({ error: "Templat belum diterbitkan." }, { status: 400 });
  if (template.season.archivedAt) return NextResponse.json({ error: "Musim templat ini telah diarkibkan." }, { status: 409 });

  const source = body.source as GeneratorSource;
  const cfg: GeneratorConfig = {
    eventId:           body.config?.eventId || undefined,
    competitionCodes:  body.config?.competitionCodes?.filter(Boolean),
    attendedOnly:      !!body.config?.attendedOnly,
    rankFrom:          body.config?.rankFrom ? Math.max(1, Math.floor(body.config.rankFrom)) : undefined,
    rankTo:            body.config?.rankTo ? Math.max(1, Math.floor(body.config.rankTo)) : undefined,
    verifiedOnly:      body.config?.verifiedOnly !== false,
    contingentType:    body.config?.contingentType || undefined,
    rows:              source === "CUSTOM" ? (body.config?.rows ?? []).slice(0, 20000) : undefined,
    eventNameOverride: body.config?.eventNameOverride?.trim() || undefined,
  };
  if ((source === "EVENT_PARTICIPANTS" || source === "EVENT_WINNERS") && !cfg.eventId)
    return NextResponse.json({ error: "Pilih acara." }, { status: 400 });

  try {
    const { total } = await resolveRecipients(source, cfg, 0, 1);
    const job = await db.certGeneratorJob.create({
      data: { templateId: body.templateId, source, config: cfg as unknown as Prisma.InputJsonValue, total, createdBy: session.name || session.email },
    });
    return NextResponse.json({ job }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal" }, { status: 400 });
  }
}
