import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

// ── PATCH — approve or reject a join request (OWNER only) ───────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id, requestId } = await params;

  const manager = await db.managerProfile.findUnique({ where: { clerkUserId: userId } });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const ownerLink = await db.contingentManager.findUnique({
    where: { contingentId_managerId: { contingentId: id, managerId: manager.id } },
  });
  if (!ownerLink || ownerLink.role !== "OWNER")
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { action } = await req.json() as { action: "APPROVE" | "REJECT" };
  if (action !== "APPROVE" && action !== "REJECT")
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });

  const request = await db.contingentManager.findFirst({
    where: { id: requestId, contingentId: id, status: "PENDING" },
  });
  if (!request) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const updated = await db.contingentManager.update({
    where: { id: requestId },
    data: {
      status:      action === "APPROVE" ? "ACTIVE" : "REJECTED",
      respondedAt: new Date(),
    },
    include: {
      manager: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json({ data: updated });
}
