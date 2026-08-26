import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// PATCH — confirm or reject a registration
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string; regId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { regId } = await params;

  const { status } = await req.json();
  const ALLOWED = ["CONFIRMED", "REJECTED", "CANCELLED", "PENDING"];
  if (!ALLOWED.includes(status))
    return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });

  const reg = await db.walkInRegistration.update({
    where: { id: regId },
    data: {
      status,
      ...(status === "CONFIRMED" ? { confirmedAt: new Date() } : {}),
    },
  });
  return NextResponse.json({ data: reg });
}

// DELETE — remove a registration (releases its session-slot)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string; regId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { wicId, regId } = await params;

  const reg = await db.walkInRegistration.findFirst({
    where: { id: regId, walkInCompetitionId: wicId },
    select: { id: true, _count: { select: { judgingScores: true } } },
  });
  if (!reg) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (reg._count.judgingScores > 0)
    return NextResponse.json(
      { error: "HAS_SCORES", message: "Pendaftaran ini mempunyai markah juri dan tidak boleh dibuang." },
      { status: 409 },
    );

  await db.$transaction([
    db.walkInFormSubmission.updateMany({
      where: { walkInRegistrationId: reg.id },
      data: { walkInRegistrationId: null },
    }),
    db.walkInRegistration.delete({ where: { id: reg.id } }),
  ]);

  return NextResponse.json({ deleted: true });
}
