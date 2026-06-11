import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string; managerId: string }> };

/** DELETE — remove a Co-Manager from a contingent */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, managerId } = await params;

  const record = await db.contingentManager.findUnique({
    where: { id: managerId },
    select: { id: true, role: true, contingentId: true, manager: { select: { name: true } } },
  });

  if (!record || record.contingentId !== id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (record.role === "OWNER")
    return NextResponse.json({ error: "Cannot remove the Primary Manager. Transfer the role first." }, { status: 422 });

  await db.contingentManager.delete({ where: { id: managerId } });

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
