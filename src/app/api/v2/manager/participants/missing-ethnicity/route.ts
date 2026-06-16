import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map(c => c.contingentId);
  if (contingentIds.length === 0) return NextResponse.json({ data: [] });

  const participants = await db.participant.findMany({
    where: {
      contingentId: { in: contingentIds },
      ethnicity: null,
    },
    select: {
      id: true, name: true, ic: true,
      gender: true, eduLevel: true, classGrade: true,
    },
    orderBy: [{ classGrade: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ data: participants });
}
