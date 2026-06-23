import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!eptimEduConfigured())
    return NextResponse.json({ error: "EPTIMEDU_API_KEY not found" }, { status: 503 });

  try {
    const data = await eptimEdu.courses();
    return NextResponse.json({ data: data.courses ?? [], total: data.total ?? 0 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "EptimEdu API error";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
