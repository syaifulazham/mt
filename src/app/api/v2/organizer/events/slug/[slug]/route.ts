import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { slug } = await params;

  const event = await db.event.findUnique({
    where: { slug },
    include: {
      state: { select: { id: true, name: true } },
      zone:  { select: { id: true, name: true } },
      eventCompetitions: {
        orderBy: { createdAt: "asc" },
        include: {
          competition: {
            include: {
              theme:        { select: { id: true, name: true, color: true } },
              targetGroups: { include: { targetGroup: { select: { id: true, name: true, schoolLevel: true } } } },
              _count:       { select: { teams: true } },
            },
          },
        },
      },
      _count: { select: { eventCompetitions: true } },
    },
  });

  if (!event) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ data: event });
}
