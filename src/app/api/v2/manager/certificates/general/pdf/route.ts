import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { PDFDocument } from "pdf-lib";
import { db } from "@/lib/db";
import { getCertDistribution } from "@/lib/certificates/distribution";
import { certConfigSchema } from "@/lib/certificates/config-schema";
import { renderCertificatePdf } from "@/lib/certificates/render";
import { managerContingentIds } from "@/lib/certificates/portal";
import { GENERAL_PDF_MAX } from "@/lib/certificates/general";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST { ids } — the General certificates just issued from the portal, rendered
 * in memory and merged into one PDF (nothing is written to disk). Only READY
 * General certificates of the manager's own contingents are included.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const contingentIds = await managerContingentIds(userId);
  if (!contingentIds) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
  if (!(await getCertDistribution()).manager) return NextResponse.json({ error: "NOT_DISTRIBUTED" }, { status: 403 });

  const { ids } = await req.json().catch(() => ({})) as { ids?: string[] };
  const want = [...new Set((ids ?? []).filter(x => typeof x === "string"))].slice(0, GENERAL_PDF_MAX);
  if (!want.length) return NextResponse.json({ error: "NO_CERTIFICATES" }, { status: 400 });

  const certs = (await db.certificate.findMany({
    where:   { id: { in: want }, contingentId: { in: contingentIds }, status: "READY" },
    include: { season: { select: { name: true, year: true } }, templateVersion: true },
  })).filter(c => ((c.meta as { genKey?: string } | null)?.genKey ?? "").includes(":general:"));
  if (!certs.length) return NextResponse.json({ error: "NO_CERTIFICATES" }, { status: 404 });
  const order = new Map(want.map((id, i) => [id, i]));
  certs.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const merged = await PDFDocument.create();
  for (const c of certs) {
    const config = certConfigSchema.safeParse(c.templateVersion.configuration);
    if (!config.success) continue;
    const { bytes } = await renderCertificatePdf({
      config: config.data,
      baseAsset: { url: c.templateVersion.baseAssetUrl, type: c.templateVersion.baseAssetType },
      data: { ...c, season: c.season },
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
    });
    const doc = await PDFDocument.load(bytes);
    for (const page of await merged.copyPages(doc, doc.getPageIndices())) merged.addPage(page);
  }
  const out = await merged.save();
  const code = (certs[0].competitionCode || "sijil").replace(/[^a-zA-Z0-9.]+/g, "_");

  return new NextResponse(out as unknown as BodyInit, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="Sijil_${code}_${certs.length}.pdf"`,
      "Content-Length":      String(out.length),
      "Cache-Control":       "private, no-store",
    },
  });
}
