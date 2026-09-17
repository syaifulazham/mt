import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { CertTargetType, CertTemplateStatus, Prisma } from "@prisma/client";
import { certConfigSchema } from "@/lib/certificates/config-schema";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const template = await db.certTemplate.findUnique({
    where: { id },
    include: {
      season:   { select: { id: true, code: true, name: true, year: true, archivedAt: true } },
      versions: { orderBy: { version: "desc" }, select: { id: true, version: true, publishedAt: true, publishedBy: true } },
    },
  });
  if (!template) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({ data: template });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const template = await db.certTemplate.findUnique({ where: { id }, include: { season: true } });
  if (!template) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (template.season.archivedAt)
    return NextResponse.json({ error: "SEASON_ARCHIVED" }, { status: 409 });

  const body = await req.json() as {
    name?: string; targetType?: CertTargetType; status?: CertTemplateStatus;
    draftConfig?: unknown; baseAssetUrl?: string; baseAssetType?: "PDF" | "IMAGE";
    competitionId?: string | null; eventId?: string | null;
    winnerRankFrom?: number | null; winnerRankTo?: number | null;
  };

  // Editing a published template only ever touches the draft — issued
  // certificates keep rendering from the frozen version they were issued against.
  let draftConfig: Prisma.InputJsonValue | undefined;
  if (body.draftConfig !== undefined) {
    const parsed = certConfigSchema.safeParse(body.draftConfig);
    if (!parsed.success)
      return NextResponse.json({ error: "INVALID_CONFIG", detail: parsed.error.issues.slice(0, 5) }, { status: 400 });
    draftConfig = parsed.data as unknown as Prisma.InputJsonValue;
  }

  const updated = await db.certTemplate.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.targetType && { targetType: body.targetType }),
      ...(body.status && { status: body.status }),
      ...(draftConfig !== undefined && { draftConfig }),
      ...(body.baseAssetUrl !== undefined && { baseAssetUrl: body.baseAssetUrl }),
      ...(body.baseAssetType !== undefined && { baseAssetType: body.baseAssetType }),
      ...(body.competitionId !== undefined && { competitionId: body.competitionId }),
      ...(body.eventId !== undefined && { eventId: body.eventId }),
      ...(body.winnerRankFrom !== undefined && { winnerRankFrom: body.winnerRankFrom }),
      ...(body.winnerRankTo !== undefined && { winnerRankTo: body.winnerRankTo }),
      updatedBy: session.id,
    },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;

  // A template whose versions have issued certificates can never be deleted —
  // those certificates render from its versions. Archive it instead.
  const issued = await db.certificate.count({ where: { templateVersion: { templateId: id } } });
  if (issued > 0) return NextResponse.json({ error: "HAS_ISSUED_CERTIFICATES", issued }, { status: 409 });

  await db.certTemplate.update({ where: { id }, data: { currentVersionId: null } });
  await db.certTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
