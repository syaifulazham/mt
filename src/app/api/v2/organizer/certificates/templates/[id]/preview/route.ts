import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { certConfigSchema } from "@/lib/certificates/config-schema";
import { sampleFieldSource } from "@/lib/certificates/fields";
import { renderCertificatePdf } from "@/lib/certificates/render";

/**
 * POST { config?, certificateId? } → the real PDF.
 *
 * "True preview": the editor proves WYSIWYG by rendering through the same
 * `render.ts` the download endpoint uses, rather than asserting that its canvas
 * matches. Accepts an unsaved config so the button works mid-edit.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { config?: unknown; certificateId?: string };

  const template = await db.certTemplate.findUnique({
    where: { id },
    include: { season: { select: { name: true, year: true } } },
  });
  if (!template) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!template.baseAssetUrl || !template.baseAssetType)
    return NextResponse.json({ error: "NO_BASE_ASSET" }, { status: 400 });

  const parsed = certConfigSchema.safeParse(body.config ?? template.draftConfig);
  if (!parsed.success)
    return NextResponse.json({ error: "INVALID_CONFIG", detail: parsed.error.issues.slice(0, 5) }, { status: 400 });

  // A real certificate makes the preview honest about overflow (long school
  // names are the usual surprise); sample data is the fallback.
  let data = sampleFieldSource(template.season);
  if (body.certificateId) {
    const cert = await db.certificate.findUnique({
      where: { id: body.certificateId },
      include: { season: { select: { name: true, year: true } } },
    });
    if (cert) data = { ...cert, season: cert.season };
  }

  const { bytes, warnings } = await renderCertificatePdf({
    config:    parsed.data,
    baseAsset: { url: template.baseAssetUrl, type: template.baseAssetType },
    data,
    appUrl:    process.env.NEXT_PUBLIC_APP_URL,
  });

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="preview.pdf"`,
      "Cache-Control":       "no-store",
      "X-Render-Warnings":   String(warnings.length),
    },
  });
}
