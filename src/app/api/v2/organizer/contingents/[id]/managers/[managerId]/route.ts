import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string; managerId: string }> };

const MANAGER_STATUSES = ["PENDING", "ACTIVE", "REJECTED"] as const;
type ManagerStatus = (typeof MANAGER_STATUSES)[number];

const managerListSelect = {
  id: true, role: true, status: true, createdAt: true,
  manager: { select: { id: true, name: true, email: true, phone: true } },
} as const;

/** PATCH — change a manager's status (PENDING / ACTIVE / REJECTED) */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, managerId } = await params;

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const status = body.status as ManagerStatus | undefined;
  if (!status || !MANAGER_STATUSES.includes(status))
    return NextResponse.json(
      { error: `status must be one of ${MANAGER_STATUSES.join(", ")}` },
      { status: 400 },
    );

  const record = await db.contingentManager.findUnique({
    where: { id: managerId },
    select: { id: true, contingentId: true },
  });

  if (!record || record.contingentId !== id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.contingentManager.update({
    where: { id: managerId },
    data: { status, respondedAt: new Date() },
  });

  const updated = await db.contingentManager.findMany({
    where: { contingentId: id },
    orderBy: { role: "asc" },
    select: managerListSelect,
  });

  return NextResponse.json({ managers: updated });
}

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
    select: managerListSelect,
  });

  return NextResponse.json({ managers: updated });
}
