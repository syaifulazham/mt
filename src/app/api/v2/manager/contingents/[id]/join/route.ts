import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { where: { status: { in: ["ACTIVE", "PENDING"] } } } },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
  if (manager.contingentManagers.length > 0) {
    return NextResponse.json({ error: "ALREADY_IN_CONTINGENT" }, { status: 400 });
  }

  const contingent = await db.contingent.findUnique({
    where: { id },
    include: { _count: { select: { managers: { where: { status: "ACTIVE" } } } } },
  });
  if (!contingent || contingent.status !== "ACTIVE") {
    return NextResponse.json({ error: "CONTINGENT_NOT_FOUND" }, { status: 404 });
  }

  const { message } = await req.json() as { message?: string };

  // If no active managers exist, this is a "claim" — auto-approve as OWNER
  const noManagers = contingent._count.managers === 0;

  await db.contingentManager.create({
    data: {
      contingentId:   id,
      managerId:      manager.id,
      role:           noManagers ? "OWNER"   : "MANAGER",
      status:         noManagers ? "ACTIVE"  : "PENDING",
      requestMessage: message?.trim() || null,
    },
  });

  return NextResponse.json({ ok: true, claimed: noManagers }, { status: 201 });
}
