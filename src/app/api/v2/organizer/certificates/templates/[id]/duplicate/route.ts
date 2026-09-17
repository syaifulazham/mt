import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { CertTemplateStatus, Prisma } from "@prisma/client";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

/**
 * POST { seasonId?, name? } — clone this template's head config into another
 * season. This is how a new edition starts from the previous year's designs
 * instead of being redrawn; the clone is a DRAFT with no versions, so it cannot
 * affect anything already issued.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const { seasonId, name } = await req.json().catch(() => ({})) as { seasonId?: string; name?: string };

  const source = await db.certTemplate.findUnique({ where: { id } });
  if (!source) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const targetSeasonId = seasonId ?? source.seasonId;
  const season = await db.season.findUnique({ where: { id: targetSeasonId } });
  if (!season) return NextResponse.json({ error: "SEASON_NOT_FOUND" }, { status: 404 });
  if (season.archivedAt) return NextResponse.json({ error: "SEASON_ARCHIVED" }, { status: 409 });

  const clone = await db.certTemplate.create({
    data: {
      seasonId:      targetSeasonId,
      name:          (name ?? `${source.name} (${season.code})`).trim().slice(0, 200),
      targetType:    source.targetType,
      status:        CertTemplateStatus.DRAFT,
      draftConfig:   source.draftConfig as Prisma.InputJsonValue,
      baseAssetUrl:  source.baseAssetUrl,
      baseAssetType: source.baseAssetType,
      competitionId: source.competitionId,
      eventId:       source.eventId,
      winnerRankFrom: source.winnerRankFrom,
      winnerRankTo:   source.winnerRankTo,
      prerequisites:  source.prerequisites as Prisma.InputJsonValue ?? undefined,
      createdBy:      session.id,
    },
  });

  return NextResponse.json({ data: clone }, { status: 201 });
}
