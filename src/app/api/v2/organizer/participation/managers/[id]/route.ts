import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;

  const manager = await db.managerProfile.findUnique({
    where: { id },
    include: {
      school:            { select: { id: true, name: true } },
      higherInstitution: { select: { id: true, name: true } },
      contingentManagers: {
        orderBy: { createdAt: "asc" },
        include: {
          contingent: {
            select: {
              id: true, name: true, shortName: true, contingentType: true, status: true,
              state: { select: { id: true, name: true } },
              _count: { select: { participants: true, teams: true } },
            },
          },
        },
      },
    },
  });

  if (!manager) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ data: manager });
}
