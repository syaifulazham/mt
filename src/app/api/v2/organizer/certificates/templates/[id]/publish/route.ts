import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { CertTemplateStatus, Prisma } from "@prisma/client";
import { certConfigSchema } from "@/lib/certificates/config-schema";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

/**
 * POST — freeze the current draft as an immutable version and point the template
 * at it.
 *
 * This is what stops an edit in 2027 from silently changing 116 k certificates
 * issued in 2025: with on-demand rendering the appearance of an issued
 * certificate is decided by its template *version*, and versions are never
 * rewritten.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const template = await db.certTemplate.findUnique({ where: { id }, include: { season: true } });
  if (!template) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (template.season.archivedAt) return NextResponse.json({ error: "SEASON_ARCHIVED" }, { status: 409 });
  if (!template.baseAssetUrl || !template.baseAssetType)
    return NextResponse.json({ error: "NO_BASE_ASSET" }, { status: 400 });

  const parsed = certConfigSchema.safeParse(template.draftConfig);
  if (!parsed.success)
    return NextResponse.json({ error: "INVALID_CONFIG", detail: parsed.error.issues.slice(0, 5) }, { status: 400 });
  if (!parsed.data.elements.length)
    return NextResponse.json({ error: "EMPTY_CONFIG" }, { status: 400 });

  const version = await db.$transaction(async (tx) => {
    const last = await tx.certTemplateVersion.findFirst({
      where: { templateId: id }, orderBy: { version: "desc" }, select: { version: true },
    });
    const created = await tx.certTemplateVersion.create({
      data: {
        templateId:    id,
        version:       (last?.version ?? 0) + 1,
        baseAssetUrl:  template.baseAssetUrl!,
        baseAssetType: template.baseAssetType!,
        configuration: parsed.data as unknown as Prisma.InputJsonValue,
        publishedBy:   session.id,
      },
    });
    await tx.certTemplate.update({
      where: { id },
      data:  { currentVersionId: created.id, status: CertTemplateStatus.ACTIVE, updatedBy: session.id },
    });
    return created;
  });

  return NextResponse.json({ data: version }, { status: 201 });
}
