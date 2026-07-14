import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

// GET /api/v2/organizer/events/[id]/walkin/[wicId]/registrations
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { wicId } = await params;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const rows = await db.walkInRegistration.findMany({
    where: {
      walkInCompetitionId: wicId,
      ...(status ? { status: status as "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED" } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: {
      participant: { select: { id: true, name: true, ic: true, gender: true, eduLevel: true, classGrade: true } },
      contingent:  { select: { id: true, name: true, shortName: true } },
    },
  });

  const counts = await db.walkInRegistration.groupBy({
    by: ["status"],
    where: { walkInCompetitionId: wicId },
    _count: { _all: true },
  });

  const stats = Object.fromEntries(counts.map(c => [c.status, c._count._all]));

  return NextResponse.json({ data: rows, stats });
}
