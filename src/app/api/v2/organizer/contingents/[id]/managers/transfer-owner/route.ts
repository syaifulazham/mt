import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { newOwnerId } = await req.json(); // ContingentManager.id of the new owner

  if (!newOwnerId) return NextResponse.json({ error: "MISSING_NEW_OWNER" }, { status: 400 });

  const [currentOwner, newOwnerRecord] = await Promise.all([
    db.contingentManager.findFirst({ where: { contingentId: id, role: "OWNER" } }),
    db.contingentManager.findUnique({ where: { id: newOwnerId } }),
  ]);

  if (!newOwnerRecord || newOwnerRecord.contingentId !== id)
    return NextResponse.json({ error: "INVALID_MANAGER" }, { status: 400 });

  if (newOwnerRecord.role === "OWNER")
    return NextResponse.json({ error: "ALREADY_OWNER" }, { status: 400 });

  await db.$transaction([
    // Demote current owner → MANAGER (if exists)
    ...(currentOwner
      ? [db.contingentManager.update({ where: { id: currentOwner.id }, data: { role: "MANAGER" } })]
      : []),
    // Promote new owner
    db.contingentManager.update({ where: { id: newOwnerId }, data: { role: "OWNER" } }),
  ]);

  const updated = await db.contingentManager.findMany({
    where: { contingentId: id },
    orderBy: { role: "asc" },
    select: {
      id: true, role: true, status: true, createdAt: true,
      manager: { select: { id: true, name: true, email: true, phone: true } },
    },
  });

  return NextResponse.json({ managers: updated });
}
