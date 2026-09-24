import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { csiConfigured, csiListCompetitionCases } from "@/lib/eptim-csi";

// GET /api/v2/organizer/csi/competitions/[id]/cases — cases of one CSI competition
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!csiConfigured())
    return NextResponse.json({ error: "EPTIMCSI_API_KEY not found" }, { status: 503 });

  const { id } = await params;

  try {
    const { competition, cases } = await csiListCompetitionCases(id);
    return NextResponse.json({ competition, data: cases });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error(`[eptim-csi] listCompetitionCases failed for ${id}:`, err.message, "| upstream:", err.detail ?? "—");
    if (err.status === 404) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ error: err.message ?? "Eptim CSI API error" }, { status: 422 });
  }
}
