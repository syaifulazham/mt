import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

// ── GET  — list pending join requests (OWNER only) ───────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;

  const manager = await db.managerProfile.findUnique({ where: { clerkUserId: userId } });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const link = await db.contingentManager.findUnique({
    where: { contingentId_managerId: { contingentId: id, managerId: manager.id } },
  });
  if (!link || link.role !== "OWNER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const requests = await db.contingentManager.findMany({
    where: { contingentId: id, status: "PENDING" },
    include: {
      manager: { select: { name: true, email: true, phone: true, institutionType: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: requests });
}
