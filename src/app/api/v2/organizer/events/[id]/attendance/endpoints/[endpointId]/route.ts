import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// PATCH — retire / restore / relabel
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; endpointId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { endpointId } = await params;
  const body = await req.json().catch(() => ({})) as {
    active?: boolean;
    label?: string;
  };

  const data: { active?: boolean; retiredAt?: Date | null; label?: string } = {};

  if (typeof body.active === "boolean") {
    data.active = body.active;
    data.retiredAt = body.active ? null : new Date();
  }
  if (typeof body.label === "string") {
    data.label = body.label.trim() || undefined;
  }

  const updated = await db.attendanceEndpoint.update({
    where: { id: endpointId },
    data,
    select: {
      id: true, routeCode: true, passcode: true, label: true,
      active: true, retiredAt: true, createdAt: true,
    },
  });

  return NextResponse.json({ data: updated });
}

// DELETE — permanently remove
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; endpointId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { endpointId } = await params;

  await db.attendanceEndpoint.delete({ where: { id: endpointId } });

  return NextResponse.json({ ok: true });
}
