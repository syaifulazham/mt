import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; teamId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, teamId } = await params;

  const team = await db.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      members: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          participant: {
            select: {
              id: true, name: true, ic: true, gender: true,
              age: true, eduLevel: true, status: true,
            },
          },
        },
      },
      trainers: {
        orderBy: { trainer: { name: "asc" } },
        select: {
          trainer: {
            select: { id: true, name: true, ic: true, phoneNumber: true, status: true },
          },
        },
      },
    },
  });

  if (!team || !team) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Guard: team must belong to the contingent
  const belongs = await db.team.count({ where: { id: teamId, contingentId: id } });
  if (!belongs) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(team);
}
