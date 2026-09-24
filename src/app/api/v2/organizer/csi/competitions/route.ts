import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { csiConfigured, csiListCompetitions } from "@/lib/eptim-csi";

// GET /api/v2/organizer/csi/competitions — CSI competitions available to link
export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!csiConfigured())
    return NextResponse.json({ error: "EPTIMCSI_API_KEY not found" }, { status: 503 });

  try {
    return NextResponse.json({ data: await csiListCompetitions() });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error("[eptim-csi] listCompetitions failed:", err.message, "| upstream:", err.detail ?? "—");
    return NextResponse.json({ error: err.message ?? "Eptim CSI API error" }, { status: 422 });
  }
}
