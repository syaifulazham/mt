import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

// DELETE all PROCESSING records → they revert to gray (pending) so user can restart
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;

  const { count } = await db.contingentDistance.deleteMany({
    where: { eventId, status: "PROCESSING" },
  });

  return NextResponse.json({ stopped: count });
}
