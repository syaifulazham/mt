import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

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
    endpoint: { eventId: id },
    ...(status ? { status: status as "PENDING" | "PROCESSED" | "NO_MATCH" } : {}),
  };

  const [submissions, pending, processed, noMatch] = await Promise.all([
    db.walkInFormSubmission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, ic: true, name: true, schoolName: true,
        sessionNumber: true, slotNumber: true, status: true,
        createdAt: true, processedAt: true,
        walkInCompetition: {
          select: {
            id: true,
            competition: { select: { code: true, name: true } },
          },
        },
        participant: { select: { id: true, name: true } },
      },
    }),
    db.walkInFormSubmission.count({ where: { endpoint: { eventId: id }, status: "PENDING" } }),
    db.walkInFormSubmission.count({ where: { endpoint: { eventId: id }, status: "PROCESSED" } }),
    db.walkInFormSubmission.count({ where: { endpoint: { eventId: id }, status: "NO_MATCH" } }),
  ]);

  return NextResponse.json({
    data: submissions,
    counts: { PENDING: pending, PROCESSED: processed, NO_MATCH: noMatch },
  });
}
