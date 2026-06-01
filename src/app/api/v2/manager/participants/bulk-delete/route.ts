import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);

  const { ids } = await req.json() as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: "NO_IDS" }, { status: 400 });

  // Only delete participants that belong to this manager's contingents
  const { count } = await db.participant.deleteMany({
    where: { id: { in: ids }, contingentId: { in: contingentIds } },
  });

  return NextResponse.json({ deleted: count });
}
