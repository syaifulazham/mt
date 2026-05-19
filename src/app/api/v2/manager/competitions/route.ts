import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

// ── GET /api/v2/manager/competitions  ────────────────────────────────────────
// Returns TEAM-type competitions from the global catalog
export async function GET(_req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const manager = await db.managerProfile.findUnique({ where: { clerkUserId: userId } });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const competitions = await db.competition.findMany({
    where: { participationType: "TEAM" },
    select: {
      id: true,
      code: true,
      name: true,
      minTeamSize: true,
      maxTeamSize: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: competitions });
}
