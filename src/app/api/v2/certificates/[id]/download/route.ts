import { NextRequest, NextResponse } from "next/server";
import { auth as clerkAuth } from "@clerk/nextjs/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { certConfigSchema } from "@/lib/certificates/config-schema";
import { certificateFilename, renderCertificatePdf } from "@/lib/certificates/render";

/**
 * GET — renders the certificate in memory and streams it.
 *
 * No disk writes and no cache directory: mt25 accumulated 135 GB of generated
 * PDFs before moving to on-demand rendering.
 *
 * Access: organizer (any), participant (own), manager (own contingent's).
 * Public access goes through /verify/<uniqueCode>, never through this route —
 * ids are not secrets but they are not verification either.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const certificate = await db.certificate.findUnique({
    where: { id },
    include: {
      season:          { select: { code: true, name: true, year: true } },
      templateVersion: { include: { template: { select: { name: true } } } },
    },
  });
  if (!certificate) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (certificate.revokedAt)
    return NextResponse.json({ error: "REVOKED", reason: certificate.revokedReason }, { status: 410 });

  if (!(await isAllowed(certificate.participantId, certificate.contingentId)))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const parsed = certConfigSchema.safeParse(certificate.templateVersion.configuration);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_TEMPLATE_CONFIG" }, { status: 500 });

  const { bytes, warnings } = await renderCertificatePdf({
    config:    parsed.data,
    baseAsset: { url: certificate.templateVersion.baseAssetUrl, type: certificate.templateVersion.baseAssetType },
    data:      { ...certificate, season: certificate.season },
    appUrl:    process.env.NEXT_PUBLIC_APP_URL,
  });
  for (const w of warnings)
    console.warn(`[certificate ${certificate.serialNumber}] ${w.elementId}: ${w.message}`);

  const filename = certificateFilename(
    certificate.season.code, certificate.templateVersion.template.name, certificate.serialNumber,
  );

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length":      String(bytes.length),
      "Cache-Control":       "private, no-store",
    },
  });
}

async function isAllowed(participantId: string | null, contingentId: string | null): Promise<boolean> {
  if (await getOrganizerSession()) return true;

  const participant = await getParticipantSession();
  if (participant) return !!participantId && participant.participantId === participantId;

  const { userId } = await clerkAuth();
  if (userId && contingentId) {
    const manager = await db.managerProfile.findUnique({
      where:  { clerkUserId: userId },
      select: { contingentManagers: { select: { contingentId: true } } },
    });
    return !!manager?.contingentManagers.some((cm) => cm.contingentId === contingentId);
  }

  return false;
}
