import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

// ── GET /api/v2/manager/teams  ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const competitionId = searchParams.get("competitionId") ?? undefined;

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  if (contingentIds.length === 0)
    return NextResponse.json({ data: [] });

  const teams = await db.team.findMany({
    where: {
      contingentId: { in: contingentIds },
      ...(competitionId && { competitionId }),
    },
    include: {
      competition: { select: { id: true, name: true, code: true, maxTeamSize: true, minTeamSize: true, eptimEduCourseId: true } },
      members: {
        include: {
          participant: { select: { id: true, name: true, gender: true, eduLevel: true } },
        },
      },
      trainers: {
        include: {
          trainer: { select: { id: true, name: true, phoneNumber: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      teamEvents: {
        include: {
          event: { select: { id: true, name: true, slug: true, status: true, startDate: true, endDate: true, scope: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ competitionId: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ data: teams });
}

// ── POST /api/v2/manager/teams  ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: {
      contingentManagers: {
        where: { role: { in: ["OWNER", "MANAGER"] } },
        select: { contingentId: true },
      },
    },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  if (contingentIds.length === 0)
    return NextResponse.json({ error: "NO_CONTINGENT" }, { status: 400 });

  const body = await req.json();
  const { name, competitionId, contingentId } = body;

  if (!name?.trim())    return NextResponse.json({ error: "MISSING_NAME" },        { status: 400 });
  if (!competitionId)   return NextResponse.json({ error: "MISSING_COMPETITION" }, { status: 400 });
  if (!contingentId)    return NextResponse.json({ error: "MISSING_CONTINGENT" },  { status: 400 });

  if (!contingentIds.includes(contingentId))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const competition = await db.competition.findUnique({ where: { id: competitionId } });
  if (!competition) return NextResponse.json({ error: "COMPETITION_NOT_FOUND" }, { status: 404 });
  if (competition.participationType !== "TEAM")
    return NextResponse.json({ error: "NOT_A_TEAM_COMPETITION" }, { status: 400 });

  const team = await db.team.create({
    data: { name: name.trim(), competitionId, contingentId },
    include: {
      competition: { select: { id: true, name: true, code: true, maxTeamSize: true, minTeamSize: true } },
      members: true,
      trainers: { include: { trainer: { select: { id: true, name: true, phoneNumber: true } } } },
    },
  });

  return NextResponse.json({ data: team }, { status: 201 });
}
