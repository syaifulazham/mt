import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { BATCH_SIZE, DISTRIBUTION_LEVELS, GENERATOR_SOURCES, RESULTS_BY, issueBatch, normalizeConfig, resolveRecipients, type DistributionLevel, type ResultsBy, type GeneratorConfig, type GeneratorSource } from "@/lib/certificates/generator";
import { refreshExtras } from "@/lib/certificates/pregen";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

/**
 * POST { offset, refresh? } — generate one batch of the job. With `refresh`,
 * certificates already issued for the template get their snapshot rewritten
 * from the current data (serials unchanged) instead of being skipped. The page calls this until
 * `nextOffset` is null, which is what drives its progress bar. Recipients
 * already issued for the template are skipped, so re-running is safe.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const { offset = 0, refresh = false } = await req.json().catch(() => ({})) as { offset?: number; refresh?: boolean };
  const job = await db.certGeneratorJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  try {
    if (offset === 0)
      await db.certGeneratorJob.update({ where: { id }, data: { status: "RUNNING", created: 0, skipped: 0, error: null, completedAt: null } });
    const { rows, total } = await resolveRecipients(job.source as GeneratorSource, job.config as GeneratorConfig, offset, BATCH_SIZE);
    const { created, skipped, updated } = await issueBatch({
      jobId: id, templateId: job.templateId, rows, createdBy: session.id, refresh,
      distributionLevel: (job.config as GeneratorConfig).distributionLevel,
    });
    if (updated) console.warn(`[certificates] ${session.name || session.email} refreshed ${updated} issued certificates (job ${id})`);
    const nextOffset = rows.length === BATCH_SIZE && offset + rows.length < total ? offset + rows.length : null;
    // Pre-event: extra certificates (winners beyond the blanks) follow the event name as well.
    if (refresh && nextOffset === null && job.source === "EVENT_WINNERS_PREGEN") await refreshExtras(job);
    const updatedJob = await db.certGeneratorJob.update({
      where: { id },
      data: {
        total, created: { increment: created }, skipped: { increment: skipped },
        ...(nextOffset === null && { status: "DONE", completedAt: new Date() }),
      },
    });
    return NextResponse.json({ created, skipped, updated, processed: offset + rows.length, total, nextOffset, job: updatedJob });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal menjana";
    await db.certGeneratorJob.update({ where: { id }, data: { status: "FAILED", error: message } });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH { distributionLevel } — change where the job's certificates appear on
 * the portals. Applied at once to the certificates this job already issued.
 *
 * PATCH { resultsBy } — Pemenang Acara: how winners are ranked. Saved only;
 * issued certificates change when the job is re-run with "Kemas kini sijil
 * sedia ada".
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const { distributionLevel, resultsBy } = await req.json().catch(() => ({})) as { distributionLevel?: string; resultsBy?: string };
  if (resultsBy !== undefined) {
    if (!RESULTS_BY.includes(resultsBy as ResultsBy)) return NextResponse.json({ error: "INVALID_RESULTS_BY" }, { status: 400 });
    const job = await db.certGeneratorJob.findUnique({ where: { id } });
    if (!job) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (job.source !== "EVENT_WINNERS") return NextResponse.json({ error: "NOT_WINNERS_JOB" }, { status: 400 });
    await db.certGeneratorJob.update({
      where: { id },
      data:  { config: { ...(job.config as object), resultsBy } as Prisma.InputJsonValue },
    });
    return NextResponse.json({ ok: true });
  }
  if (!DISTRIBUTION_LEVELS.includes(distributionLevel as DistributionLevel))
    return NextResponse.json({ error: "INVALID_LEVEL" }, { status: 400 });
  const job = await db.certGeneratorJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await db.certGeneratorJob.update({
    where: { id },
    data:  { config: { ...(job.config as object), distributionLevel } as Prisma.InputJsonValue },
  });
  const applied = await db.$executeRaw`
    UPDATE certificates SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('distLevel', ${distributionLevel}::text)
    WHERE meta->>'jobId' = ${id}`;
  console.warn(`[certificates] ${session.name || session.email} set distribution of job ${id} to ${distributionLevel} (${applied} certificates)`);
  return NextResponse.json({ ok: true, applied });
}

/**
 * PUT { templateId, source, config } — edit a generator's settings. Once it has
 * issued certificates its template and recipient source are fixed (re-running
 * matches recipients by template, and serials stay with this generator). A
 * changed distribution level is applied to the certificates already issued, as
 * PATCH does; everything else takes effect on the next "Jana". CUSTOM keeps its
 * rows when no new ones are sent.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const job = await db.certGeneratorJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const body = await req.json().catch(() => ({})) as { templateId?: string; source?: string; config?: GeneratorConfig };

  const issued = await db.certificate.count({ where: { meta: { path: ["jobId"], equals: id } } });
  const templateId = body.templateId || job.templateId;
  const source = (body.source || job.source) as GeneratorSource;
  if (!GENERATOR_SOURCES.includes(source)) return NextResponse.json({ error: "Data penerima tidak sah." }, { status: 400 });
  if (issued && (templateId !== job.templateId || source !== job.source))
    return NextResponse.json({ error: "Templat dan data penerima tidak boleh ditukar selepas sijil dijana. Duplikasi penjana ini untuk tetapan baharu." }, { status: 409 });
  if (templateId !== job.templateId) {
    const t = await db.certTemplate.findUnique({ where: { id: templateId }, select: { currentVersionId: true, season: { select: { archivedAt: true } } } });
    if (!t?.currentVersionId) return NextResponse.json({ error: "Templat belum diterbitkan." }, { status: 400 });
    if (t.season.archivedAt) return NextResponse.json({ error: "Musim templat ini telah diarkibkan." }, { status: 409 });
  }

  const old = job.config as GeneratorConfig;
  const raw = { ...body.config };
  if (source === "CUSTOM" && !raw.rows?.length) raw.rows = old.rows;
  const norm = normalizeConfig(source, raw);
  if ("error" in norm) return NextResponse.json({ error: norm.error }, { status: 400 });
  const cfg = norm.cfg;

  try {
    const { total } = await resolveRecipients(source, cfg, 0, 1);
    await db.certGeneratorJob.update({
      where: { id },
      data: { templateId, source, config: cfg as unknown as Prisma.InputJsonValue, total },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal" }, { status: 400 });
  }

  let applied = 0;
  if ((cfg.distributionLevel ?? "NONE") !== (old.distributionLevel ?? "NONE") && issued)
    applied = await db.$executeRaw`
      UPDATE certificates SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('distLevel', ${cfg.distributionLevel ?? "NONE"}::text)
      WHERE meta->>'jobId' = ${id}`;
  console.warn(`[certificates] ${session.name || session.email} edited generator ${id}${applied ? ` (distribution applied to ${applied})` : ""}`);
  return NextResponse.json({ ok: true, applied });
}

/** DELETE — remove the job (issued certificates stay; manage them under Issued). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  await db.certGeneratorJob.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
