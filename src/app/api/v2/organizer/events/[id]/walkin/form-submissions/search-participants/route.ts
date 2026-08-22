import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

// GET ?q= — organizer participant search by IC or name (full IC visible)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await params;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ data: [] });

  const participants = await db.participant.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { ic: { contains: q.replace(/[\s-]/g, "") } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 20,
    select: {
      id: true, name: true, ic: true,
      age: true, eduLevel: true, classGrade: true,
      contingent: { select: { name: true, shortName: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    data: participants.map(p => ({
      id: p.id, name: p.name, ic: p.ic,
      age: p.age, eduLevel: p.eduLevel, classGrade: p.classGrade,
      contingentName: p.contingent.shortName ?? p.contingent.name,
    })),
  });
}
