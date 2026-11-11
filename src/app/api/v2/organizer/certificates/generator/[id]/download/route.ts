import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { Zip, ZipPassThrough } from "fflate";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { certConfigSchema, type CertConfig } from "@/lib/certificates/config-schema";
import { certificateFilename, renderCertificatePdf, renderCertificatesPdf } from "@/lib/certificates/render";

export const dynamic = "force-dynamic";
const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

const FORMATS = ["single", "competition", "state", "contingent"] as const;
type Format = (typeof FORMATS)[number];

const clean = (s: string) => s.replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "_";

/**
 * GET ?format=single|competition|state|contingent&q= — this generator's
 * certificates (not revoked; `q` as on the list page) as one ZIP:
 *   single      — one PDF per certificate
 *   competition — one multi-page PDF per competition
 *   state       — one multi-page PDF per state
 *   contingent  — one multi-page PDF per contingent (inside a folder per state)
 * Rendered and zipped on the fly, one file at a time — nothing is written to
 * disk (see AGENTS.md: certificates are always rendered on demand).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const format = (FORMATS as readonly string[]).includes(req.nextUrl.searchParams.get("format") ?? "")
    ? req.nextUrl.searchParams.get("format") as Format : "single";
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  const job = await db.certGeneratorJob.findUnique({ where: { id }, select: { id: true, templateId: true } });
  if (!job) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const templateName = (await db.certTemplate.findUnique({ where: { id: job.templateId }, select: { name: true } }))?.name ?? "Sijil";

  const where: Prisma.CertificateWhereInput = {
    meta: { path: ["jobId"], equals: id },
    status: { not: "REVOKED" }, revokedAt: null,
    ...(q && {
      OR: [
        { recipientName:   { contains: q, mode: "insensitive" } },
        { recipientIc:     { contains: q } },
        { serialNumber:    { contains: q, mode: "insensitive" } },
        { contingentName:  { contains: q, mode: "insensitive" } },
        { competitionCode: { contains: q, mode: "insensitive" } },
        { competitionName: { contains: q, mode: "insensitive" } },
      ],
    }),
  };
  const certs = await db.certificate.findMany({
    where,
    orderBy: [{ competitionCode: "asc" }, { stateName: { sort: "asc", nulls: "last" } }, { rank: { sort: "asc", nulls: "last" } },
              { contingentName: { sort: "asc", nulls: "last" } }, { serialNumber: "asc" }],
    include: { season: { select: { code: true, name: true, year: true } } },
  });
  if (certs.length === 0) return NextResponse.json({ error: "Tiada sijil untuk dimuat turun." }, { status: 404 });

  const versions = new Map((await db.certTemplateVersion.findMany({
    where: { id: { in: [...new Set(certs.map(c => c.templateVersionId))] } },
    select: { id: true, version: true, configuration: true, baseAssetUrl: true, baseAssetType: true },
  })).map(v => {
    const parsed = certConfigSchema.safeParse(v.configuration);
    return [v.id, { ...v, config: parsed.success ? parsed.data : null }] as const;
  }));
  if ([...versions.values()].some(v => !v.config))
    return NextResponse.json({ error: "INVALID_TEMPLATE_CONFIG" }, { status: 500 });

  // Files: [path, certificates]; a group with several template versions is split per version.
  const files: [string, typeof certs][] = [];
  if (format === "single") {
    const seen = new Set<string>();
    for (const c of certs) {
      const folder = c.competitionCode ? `${clean(`${c.competitionCode} ${c.competitionName ?? ""}`)}/` : "";
      let name = folder + certificateFilename(c.season.code, templateName, c.serialNumber);
      while (seen.has(name)) name = name.replace(/\.pdf$/, "_.pdf");
      seen.add(name);
      files.push([name, [c]]);
    }
  } else {
    const keyOf = (c: (typeof certs)[number]) =>
      format === "competition" ? clean(c.competitionCode ? `${c.competitionCode} ${c.competitionName ?? ""}` : "Tanpa pertandingan")
      : format === "state" ? clean(c.stateName || "Tanpa negeri")
      : `${clean(c.stateName || "Tanpa negeri")}/${clean(c.contingentName || "Tanpa kontinjen")}`;
    const groups = new Map<string, typeof certs>();
    for (const c of certs) {
      const k = keyOf(c);
      groups.set(k, [...(groups.get(k) ?? []), c]);
    }
    for (const [k, list] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
      const byVersion = new Map<string, typeof certs>();
      for (const c of list) byVersion.set(c.templateVersionId, [...(byVersion.get(c.templateVersionId) ?? []), c]);
      for (const [vid, part] of byVersion)
        files.push([`${k}${byVersion.size > 1 ? ` (v${versions.get(vid)!.version})` : ""}.pdf`, part]);
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let failed = false;
      const zip = new Zip((err, chunk, final) => {
        if (err) { failed = true; controller.error(err); return; }
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      try {
        for (const [path, list] of files) {
          if (req.signal.aborted || failed) break;
          const v = versions.get(list[0].templateVersionId)!;
          const baseAsset = { url: v.baseAssetUrl, type: v.baseAssetType };
          const config = v.config as CertConfig;
          const { bytes } = list.length === 1
            ? await renderCertificatePdf({ config, baseAsset, data: { ...list[0], season: list[0].season }, appUrl })
            : await renderCertificatesPdf({ config, baseAsset, items: list.map(c => ({ ...c, season: c.season })), appUrl });
          const entry = new ZipPassThrough(path);   // PDFs are already compressed: store
          zip.add(entry);
          entry.push(bytes, true);
        }
        if (!failed) zip.end();
      } catch (e) {
        console.error(`[certificates] bulk download of job ${id} failed:`, e);
        if (!failed) controller.error(e);
      }
    },
  });

  const zipName = `${clean(templateName).replace(/ /g, "_")}_${format}.zip`;
  console.warn(`[certificates] ${session.name || session.email} downloaded ${certs.length} certificates of job ${id} as ${format} (${files.length} files)`);
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Cache-Control": "private, no-store",
      "X-Accel-Buffering": "no",   // let nginx pass the stream through as it is produced
    },
  });
}
