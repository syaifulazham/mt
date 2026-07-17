import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { stopRequested } from "../processing-state";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;

  // Signal the background loop to stop after the current school finishes
  stopRequested.add(eventId);

  // Also delete any PROCESSING record so it reverts to gray immediately
  const { count } = await db.contingentDistance.deleteMany({
    where: { eventId, status: "PROCESSING" },
  });

  return NextResponse.json({ stopped: count });
}
