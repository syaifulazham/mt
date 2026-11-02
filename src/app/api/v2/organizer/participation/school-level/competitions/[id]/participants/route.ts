import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { getSchoolLevelParticipantsPage } from "@/lib/schoolLevelStats";

export const dynamic = "force-dynamic";

/**
 * GET ?after=<participantId> — one page (5,000) of the competition's eligible
 * school-contingent participants, for the XLSX download. Keyset-paged: pass
 * the returned `next` as `after` until it is null.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (session.role === "VIEWER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const page = await getSchoolLevelParticipantsPage(id, req.nextUrl.searchParams.get("after"));
  return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
}
