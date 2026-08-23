import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// DELETE — remove a form submission (releases its session-slot)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id, subId } = await params;

  const sub = await db.walkInFormSubmission.findFirst({
    where: { id: subId, endpoint: { eventId: id } },
    select: { id: true, status: true },
  });
  if (!sub) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await db.walkInFormSubmission.delete({ where: { id: sub.id } });

  return NextResponse.json({ deleted: true });
}
