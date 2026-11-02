import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { getSchoolLevelOverview, getSchoolLevelResult } from "@/lib/schoolLevelStats";

export const dynamic = "force-dynamic";

/**
 * GET — Participation → School Level.
 *   (no params)  levels with competition / participant counts and distinct schools (fast)
 *   ?level=X     one level's eligibility pass: per-competition counts, totals, breakdowns
 */
export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const level = req.nextUrl.searchParams.get("level");
  const noStore = { headers: { "Cache-Control": "no-store" } };
  return NextResponse.json(level ? await getSchoolLevelResult(level) : await getSchoolLevelOverview(), noStore);
}
