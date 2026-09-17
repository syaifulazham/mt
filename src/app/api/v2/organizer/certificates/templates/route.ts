import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { CertTargetType, CertTemplateStatus, Prisma } from "@prisma/client";
import { emptyConfig } from "@/lib/certificates/config-schema";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q          = searchParams.get("q") ?? "";
  const seasonId   = searchParams.get("seasonId") ?? "";
  const targetType = searchParams.get("targetType") ?? "";
  const status     = searchParams.get("status") ?? "";
  const page       = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize   = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? String(PAGE_SIZE), 10)));

  const where: Prisma.CertTemplateWhereInput = {
    ...(q && { name: { contains: q, mode: "insensitive" } }),
    ...(seasonId && { seasonId }),
    ...(targetType && { targetType: targetType as CertTargetType }),
    ...(status && { status: status as CertTemplateStatus }),
  };

  const [data, total] = await Promise.all([
    db.certTemplate.findMany({
      where,
      orderBy: [{ season: { year: "desc" } }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        season:         { select: { id: true, code: true, name: true, archivedAt: true } },
        currentVersion: { select: { id: true, version: true, publishedAt: true } },
        _count:         { select: { versions: true } },
      },
    }),
    db.certTemplate.count({ where }),
  ]);

  // Issued counts come from the versions, not the template — a certificate is
  // bound to the version it was issued against.
  const issued = await db.certificate.groupBy({
    by: ["templateVersionId"],
    where: { templateVersion: { templateId: { in: data.map((t) => t.id) } } },
    _count: { _all: true },
  });
  const versions = await db.certTemplateVersion.findMany({
    where:  { templateId: { in: data.map((t) => t.id) } },
    select: { id: true, templateId: true },
  });
  const issuedByTemplate = new Map<string, number>();
  for (const row of issued) {
    const templateId = versions.find((v) => v.id === row.templateVersionId)?.templateId;
    if (templateId) issuedByTemplate.set(templateId, (issuedByTemplate.get(templateId) ?? 0) + row._count._all);
  }

  return NextResponse.json({
    data: data.map((t) => ({ ...t, issuedCount: issuedByTemplate.get(t.id) ?? 0 })),
    total, page, pageSize,
  });
}

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { seasonId, name, targetType, paper, orientation, baseAssetUrl, baseAssetType, competitionId, eventId } =
    await req.json() as {
      seasonId?: string; name?: string; targetType?: CertTargetType;
      paper?: "A4" | "A3" | "LETTER"; orientation?: "portrait" | "landscape";
      baseAssetUrl?: string; baseAssetType?: "PDF" | "IMAGE";
      competitionId?: string; eventId?: string;
    };

  if (!seasonId || !name?.trim() || !targetType)
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const season = await db.season.findUnique({ where: { id: seasonId } });
  if (!season) return NextResponse.json({ error: "SEASON_NOT_FOUND" }, { status: 404 });
  if (season.archivedAt)
    return NextResponse.json({ error: "SEASON_ARCHIVED" }, { status: 409 });

  const template = await db.certTemplate.create({
    data: {
      seasonId, name: name.trim(), targetType,
      draftConfig: emptyConfig(paper ?? "A4", orientation ?? "portrait") as unknown as Prisma.InputJsonValue,
      baseAssetUrl: baseAssetUrl ?? null,
      baseAssetType: baseAssetType ?? null,
      competitionId: competitionId ?? null,
      eventId: eventId ?? null,
      createdBy: session.id,
    },
  });

  return NextResponse.json({ data: template }, { status: 201 });
}
