import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// DELETE — remove a specific general endpoint
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; endpointId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id, endpointId } = await params;

  await db.walkInEndpoint.delete({
    where: { id: endpointId, eventId: id, walkInCompetitionId: null },
  });

  return NextResponse.json({ success: true });
}
