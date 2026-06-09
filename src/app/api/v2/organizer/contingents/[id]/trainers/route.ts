import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const trainers = await db.trainer.findMany({
    where: { contingentId: id },
    orderBy: { name: "asc" },
    select: {
      id:          true,
      name:        true,
      ic:          true,
      email:       true,
      phoneNumber: true,
      status:      true,
      createdAt:   true,
      teams: {
        select: {
          team: {
            select: { id: true, name: true, competition: { select: { code: true, name: true } } },
          },
        },
      },
    },
  });

  return NextResponse.json({ data: trainers });
}
