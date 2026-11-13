import { NextRequest, NextResponse } from "next/server";
import { Zip, ZipPassThrough } from "fflate";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { certConfigSchema, type CertConfig } from "@/lib/certificates/config-schema";
import { certificateFilename, renderCertificatePdf, renderCertificatesPdf } from "@/lib/certificates/render";
import { applyFilters, chunkKeyOf, compareCerts, loadKeyed, parseDownloadParams, setProgress } from "@/lib/certificates/bulk-download";

export const dynamic = "force-dynamic";
const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

const clean = (s: string) => s.replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "_";

/**
 * GET ?format=single|competition|state|contingent&sort=competition|contingent|name|serial&q=&states=&targetGroups=&competitions=&chunkBy=&chunk=&token=
 * — this generator's certificates (not revoked; `q` as on the list page;
 * states / targetGroups / competitions are |-separated filters) as one ZIP.
 * With `chunkBy` (state | contingent | competition | targetGroup) and `chunk`,
 * only that part of the split is sent — the page downloads the parts one after
 * another (see ./plan). `token` names a progress entry the page polls
 * (./progress). Inside the ZIP:
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
  const { format, chunkBy, sort, filters, chunk, token } = parseDownloadParams(req.nextUrl.searchParams);
  const fail = (error: string, status: number) => { setProgress(token, { finished: true, error }); return NextResponse.json({ error }, { status }); };

  const job = await db.certGeneratorJob.findUnique({ where: { id }, select: { id: true, templateId: true } });
  if (!job) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const templateName = (await db.certTemplate.findUnique({ where: { id: job.templateId }, select: { name: true } }))?.name ?? "Sijil";

  // Which certificates: search and filters, then the one part of the split asked for.
  let wanted = applyFilters(await loadKeyed(id, filters.q), filters);
  if (chunkBy !== "none" && chunk !== null) wanted = wanted.filter(r => chunkKeyOf(r, chunkBy) === chunk);
  const ids = wanted.map(r => r.id);
  // In slices: a big job has more ids than one query takes as parameters.
  const certs = (await Promise.all(Array.from({ length: Math.ceil(ids.length / 5000) }, (_, k) =>
    db.certificate.findMany({
      where: { id: { in: ids.slice(k * 5000, (k + 1) * 5000) } },
      include: { season: { select: { code: true, name: true, year: true } } },
    })))).flat();
  // Page / file order for the download's purpose (see SORTS).
  certs.sort((a, b) => compareCerts(sort, a, b));
  if (certs.length === 0) return fail("Tiada sijil untuk dimuat turun.", 404);

  const versions = new Map((await db.certTemplateVersion.findMany({
    where: { id: { in: [...new Set(certs.map(c => c.templateVersionId))] } },
    select: { id: true, version: true, configuration: true, baseAssetUrl: true, baseAssetType: true },
  })).map(v => {
    const parsed = certConfigSchema.safeParse(v.configuration);
    return [v.id, { ...v, config: parsed.success ? parsed.data : null }] as const;
  }));
  if ([...versions.values()].some(v => !v.config))
    return fail("INVALID_TEMPLATE_CONFIG", 500);

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

  setProgress(token, { done: 0, total: files.length, certs: certs.length, finished: false, error: null });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let failed = false, done = 0;
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
          const render = () => list.length === 1
            ? renderCertificatePdf({ config, baseAsset, data: { ...list[0], season: list[0].season }, appUrl })
            : renderCertificatesPdf({ config, baseAsset, items: list.map(c => ({ ...c, season: c.season })), appUrl });
          // One retry per file, so a passing hiccup does not fail the whole ZIP.
          const { bytes } = await render().catch((e) => {
            console.warn(`[certificates] bulk download of job ${id}: retrying ${path}:`, e);
            return render();
          });
          const entry = new ZipPassThrough(path);   // PDFs are already compressed: store
          zip.add(entry);
          entry.push(bytes, true);
          done++;
          setProgress(token, { done });
        }
        if (!failed) zip.end();
        setProgress(token, req.signal.aborted || failed ? { finished: true, error: "Muat turun dibatalkan." } : { finished: true });
      } catch (e) {
        console.error(`[certificates] bulk download of job ${id} failed:`, e);
        setProgress(token, { finished: true, error: "Gagal menjana sijil." });
        if (!failed) controller.error(e);
      }
    },
  });

  const part = chunkBy !== "none" && chunk !== null ? `_${clean(chunk).replace(/ /g, "_")}` : "";
  const zipName = `${clean(templateName).replace(/ /g, "_")}_${format}${part}.zip`;
  console.warn(`[certificates] ${session.name || session.email} downloaded ${certs.length} certificates of job ${id} as ${format}${part} (${files.length} files)`);
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
      "Cache-Control": "private, no-store",
      "X-Accel-Buffering": "no",   // let nginx pass the stream through as it is produced
    },
  });
}
