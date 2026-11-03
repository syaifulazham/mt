import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { BATCH_SIZE, DISTRIBUTION_LEVELS, issueBatch, resolveRecipients, type DistributionLevel, type GeneratorConfig, type GeneratorSource } from "@/lib/certificates/generator";

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
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const { distributionLevel } = await req.json().catch(() => ({})) as { distributionLevel?: string };
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

/** DELETE — remove the job (issued certificates stay; manage them under Issued). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  await db.certGeneratorJob.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
