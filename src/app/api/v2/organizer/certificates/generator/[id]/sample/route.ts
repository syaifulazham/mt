import { NextRequest, NextResponse } from "next/server";
import { CertTargetType } from "@prisma/client";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { certConfigSchema } from "@/lib/certificates/config-schema";
import { CERT_FIELDS, resolveFieldToken, type CertFieldSource } from "@/lib/certificates/fields";
import { resolveRecipients, snapshotOf, type GeneratorConfig, type GeneratorSource, type Recipient } from "@/lib/certificates/generator";
import { renderCertificatePdf } from "@/lib/certificates/render";
import { TYPE_CODE } from "@/lib/certificates/serial";

export const dynamic = "force-dynamic";
const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const SAMPLES = 20;
const POOL = 2000;   // recipients read to spread the sample across

/**
 * Pratonton before "Jana": nothing is issued and no serial is used.
 *
 * GET              — up to 20 recipients spread across the generator's list,
 *                    which template fields come out empty for them, and the
 *                    renderer's warnings for the first one.
 * GET ?index=n     — that sample rendered as a PDF with the template's current
 *                    version (the one Jana uses); serial and code read "CONTOH".
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const job = await db.certGeneratorJob.findUnique({ where: { id }, select: { templateId: true, source: true, config: true } });
  if (!job) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const template = await db.certTemplate.findUnique({
    where: { id: job.templateId },
    select: { targetType: true, season: { select: { name: true, year: true, serialPrefix: true } },
              currentVersion: { select: { configuration: true, baseAssetUrl: true, baseAssetType: true } } },
  });
  if (!template?.currentVersion) return NextResponse.json({ error: "Templat belum diterbitkan." }, { status: 400 });
  const parsed = certConfigSchema.safeParse(template.currentVersion.configuration);
  if (!parsed.success) return NextResponse.json({ error: "Konfigurasi templat tidak sah." }, { status: 500 });
  const config = parsed.data;

  let pool: Recipient[], total: number;
  try {
    ({ rows: pool, total } = await resolveRecipients(job.source as GeneratorSource, job.config as GeneratorConfig, 0, POOL));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal" }, { status: 400 });
  }
  // Evenly spread over what was read, so several competitions / states show up.
  const step = Math.max(1, pool.length / SAMPLES);
  const samples = Array.from({ length: Math.min(SAMPLES, pool.length) }, (_, i) => pool[Math.floor(i * step)]);

  const placeholder = `${template.season.serialPrefix}/${TYPE_CODE[template.targetType as CertTargetType]}/CONTOH`;
  const sourceOf = (r: Recipient): CertFieldSource => ({
    ...snapshotOf(r), serialNumber: placeholder, uniqueCode: "CONTOH", issuedAt: new Date(),
    season: { name: template.season.name, year: template.season.year },
  });
  const render = (r: Recipient) => renderCertificatePdf({
    config, data: sourceOf(r), appUrl: process.env.NEXT_PUBLIC_APP_URL,
    baseAsset: { url: template.currentVersion!.baseAssetUrl, type: template.currentVersion!.baseAssetType },
  });

  const indexParam = req.nextUrl.searchParams.get("index");
  if (indexParam !== null) {
    const r = samples[Number(indexParam)];
    if (!r) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const { bytes } = await render(r);
    return new NextResponse(bytes as unknown as BodyInit, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="contoh-${Number(indexParam) + 1}.pdf"`, "Cache-Control": "private, no-store" },
    });
  }

  // Template fields that print nothing for some samples (e.g. no school, no IC).
  const fieldTokens = [...new Set(config.elements.flatMap(el => el.type === "field" ? [el.field] : []))];
  const label = (t: string) => CERT_FIELDS.find(f => f.token === t)?.label ?? t;
  const empty = fieldTokens.map(t => ({
    field: label(t),
    count: samples.filter(r => resolveFieldToken(t, sourceOf(r)) === "").length,
  })).filter(x => x.count > 0);
  const warnings = samples.length ? [...new Set((await render(samples[0])).warnings.map(w => w.message))] : [];

  return NextResponse.json({
    total,
    samples: samples.map((r, index) => ({
      index, name: r.name, ic: r.ic, teamName: r.teamName, contingentName: r.contingentName, stateName: r.stateName,
      competitionCode: r.competitionCode, competitionName: r.competitionName, awardTitle: r.awardTitle,
    })),
    empty, warnings,
  }, { headers: { "Cache-Control": "no-store" } });
}
