import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;

  const participant = await db.participant.findUnique({
    where: { id },
    include: {
      contingent: {
        select: {
          id: true, name: true, shortName: true, contingentType: true,
          school:            { select: { id: true, name: true } },
          higherInstitution: { select: { id: true, name: true } },
        },
      },
      teamMembers: {
        include: {
          team: {
            include: {
              competition: { select: { id: true, code: true, name: true, participationType: true } },
              contingent:  { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  if (!participant) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ data: participant });
}
