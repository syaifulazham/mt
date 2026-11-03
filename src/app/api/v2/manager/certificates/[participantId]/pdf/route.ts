import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { PDFDocument } from "pdf-lib";
import { db } from "@/lib/db";
import { getCertDistribution } from "@/lib/certificates/distribution";
import { certConfigSchema } from "@/lib/certificates/config-schema";
import { renderCertificatePdf } from "@/lib/certificates/render";
import { distributedCertificates, managerContingentIds } from "@/lib/certificates/portal";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET — "Download All" for one participant: every certificate distributed to
 * the manager portal, rendered in memory and merged into a single PDF.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ participantId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const contingentIds = await managerContingentIds(userId);
  if (!contingentIds) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
  if (!(await getCertDistribution()).manager) return NextResponse.json({ error: "NOT_DISTRIBUTED" }, { status: 403 });

  const { participantId } = await params;
  const list = await distributedCertificates({ contingentIds, participantId });
  if (!list.length) return NextResponse.json({ error: "NO_CERTIFICATES" }, { status: 404 });

  const certs = await db.certificate.findMany({
    where:   { id: { in: list.map(c => c.id) } },
    include: { season: { select: { name: true, year: true } }, templateVersion: true },
  });
  const order = new Map(list.map((c, i) => [c.id, i]));
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
  const name = (list[0].recipientName || "sijil").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);

  return new NextResponse(out as unknown as BodyInit, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="Sijil_${name || "peserta"}.pdf"`,
      "Content-Length":      String(out.length),
      "Cache-Control":       "private, no-store",
    },
  });
}
