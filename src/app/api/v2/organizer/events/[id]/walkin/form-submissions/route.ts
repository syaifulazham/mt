import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { eventSlotDatesByWic } from "@/lib/walkin-slot-server";

// GET — list form submissions for the event (optional ?status=PENDING|PROCESSED|NO_MATCH)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;

  const status = req.nextUrl.searchParams.get("status");

  const where = {
    walkInCompetition: { eventId: id },
    ...(status ? { status: status as "PENDING" | "PROCESSED" | "NO_MATCH" } : {}),
  };

  const [submissions, pending, processed, noMatch, datesByWic] = await Promise.all([
    db.walkInFormSubmission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, ic: true, name: true, schoolName: true,
        slotDate: true, sessionNumber: true, slotNumber: true, status: true,
        createdAt: true, processedAt: true,
        walkInCompetition: {
          select: {
            id: true,
            competition: { select: { code: true, name: true } },
          },
        },
        participant: { select: { id: true, name: true } },
        teamName: true, teamMembers: true,
        team: { select: { id: true, name: true } },
      },
    }),
    db.walkInFormSubmission.count({ where: { walkInCompetition: { eventId: id }, status: "PENDING" } }),
    db.walkInFormSubmission.count({ where: { walkInCompetition: { eventId: id }, status: "PROCESSED" } }),
    db.walkInFormSubmission.count({ where: { walkInCompetition: { eventId: id }, status: "NO_MATCH" } }),
    eventSlotDatesByWic(id),
  ]);

  return NextResponse.json({
    data: submissions,
    counts: { PENDING: pending, PROCESSED: processed, NO_MATCH: noMatch },
    /** Open slot dates per walk-in competition (empty for one-day events). */
    dates: datesByWic,
  });
}
