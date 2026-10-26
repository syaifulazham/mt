import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { getWorkshopParticipants } from "@/lib/workshopStats";

// Registered participants of one workshop (EptimEdu course), for the XLSX download.
export async function GET(_req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (session.role === "VIEWER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { courseId } = await params;
  const data = await getWorkshopParticipants(courseId);
  return NextResponse.json({ data });
}
