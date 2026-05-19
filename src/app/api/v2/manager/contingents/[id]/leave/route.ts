import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

// POST /api/v2/manager/contingents/[id]/leave
// Body (OWNER only): { newOwnerId?: string }
//   - MANAGER / PENDING: leaves immediately (row deleted)
//   - OWNER with other active managers: newOwnerId required OR auto-picks sole peer
//   - OWNER with no other active managers: blocked
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: contingentId } = await params;

  const manager = await db.managerProfile.findUnique({ where: { clerkUserId: userId } });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const myLink = await db.contingentManager.findUnique({
    where: { contingentId_managerId: { contingentId, managerId: manager.id } },
  });
  if (!myLink) return NextResponse.json({ error: "NOT_MEMBER" }, { status: 403 });

  // Non-owner (MANAGER) or pending: just remove the row
  if (myLink.role !== "OWNER" || myLink.status !== "ACTIVE") {
    await db.contingentManager.delete({ where: { id: myLink.id } });
    return NextResponse.json({ data: { left: true } });
  }

  // OWNER path — find other active managers
  const peers = await db.contingentManager.findMany({
    where: { contingentId, status: "ACTIVE", managerId: { not: manager.id } },
    include: { manager: { select: { id: true, name: true, email: true } } },
  });

  if (peers.length === 0) {
    return NextResponse.json(
      { error: "SOLE_OWNER", message: "You are the only manager. Invite another manager before leaving." },
      { status: 409 },
    );
  }

  // Determine new owner: explicit choice or auto-pick if only one peer
  const body = await req.json().catch(() => ({})) as { newOwnerId?: string };
  let newOwnerId: string;

  if (peers.length === 1) {
    newOwnerId = peers[0].managerId;
  } else {
    if (!body.newOwnerId) {
      return NextResponse.json(
        { error: "HANDOVER_REQUIRED", peers: peers.map((p) => ({ id: p.managerId, name: p.manager.name, email: p.manager.email })) },
        { status: 400 },
      );
    }
    const valid = peers.some((p) => p.managerId === body.newOwnerId);
    if (!valid) return NextResponse.json({ error: "INVALID_HANDOVER_TARGET" }, { status: 400 });
    newOwnerId = body.newOwnerId;
  }

  // Transfer ownership then remove the outgoing owner
  await db.$transaction([
    db.contingentManager.update({
      where: { contingentId_managerId: { contingentId, managerId: newOwnerId } },
      data: { role: "OWNER" },
    }),
    db.contingentManager.delete({ where: { id: myLink.id } }),
  ]);

  return NextResponse.json({ data: { left: true, newOwnerId } });
}
