import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;

  const team = await db.team.findUnique({
    where: { id },
    include: {
      competition: { select: { id: true, code: true, name: true, participationType: true, minTeamSize: true, maxTeamSize: true } },
      contingent:  { select: { id: true, name: true, shortName: true, contingentType: true } },
      members: {
        orderBy: { createdAt: "asc" },
        include: {
          participant: { select: { id: true, name: true, gender: true, eduLevel: true, age: true, ic: true, ppki: true } },
        },
      },
      trainers: {
        orderBy: { createdAt: "asc" },
        include: {
          trainer: { select: { id: true, name: true, email: true, phoneNumber: true } },
        },
      },
    },
  });

  if (!team) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ data: team });
}
