import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q        = searchParams.get("q") ?? "";
  const themeId  = searchParams.get("themeId") ?? "";
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? String(PAGE_SIZE), 10)));

  const where: Prisma.CompetitionWhereInput = {
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
      ],
    }),
    ...(themeId === "__none__" ? { themeId: null } : themeId ? { themeId } : {}),
  };

  const [data, total] = await Promise.all([
    db.competition.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        theme:        { select: { id: true, name: true, color: true } },
        targetGroups: { include: { targetGroup: { select: { id: true, name: true, schoolLevel: true } } } },
      },
    }),
    db.competition.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const {
    code, name, description, themeId,
    participationType, minTeamSize, maxTeamSize,
    maxParticipantsPerContingent, maxTotalParticipants,
    targetGroupIds,
  } = await req.json();

  if (!code?.trim() || !name?.trim())
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  try {
    const competition = await db.competition.create({
      data: {
        code:                         code.trim().toUpperCase(),
        name:                         name.trim(),
        description:                  description?.trim()  || null,
        themeId:                      themeId              || null,
        participationType:            participationType    || "INDIVIDUAL",
        minTeamSize:                  Number(minTeamSize)  || 1,
        maxTeamSize:                  Number(maxTeamSize)  || 1,
        maxParticipantsPerContingent: Number(maxParticipantsPerContingent) || 0,
        maxTotalParticipants:         Number(maxTotalParticipants)         || 0,
        targetGroups: Array.isArray(targetGroupIds) && targetGroupIds.length > 0
          ? { create: targetGroupIds.map((tgId: string) => ({ targetGroupId: tgId })) }
          : undefined,
      },
      include: {
        targetGroups: { include: { targetGroup: { select: { id: true, name: true, schoolLevel: true } } } },
      },
    });
    return NextResponse.json({ data: competition }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "CODE_TAKEN" }, { status: 409 });
    throw e;
  }
}
