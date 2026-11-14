import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { eventChecklist } from "@/lib/eventChecklist";

export const dynamic = "force-dynamic";

/**
 * GET — Senarai Semak Pertandingan: every competition's progress from
 * registration to certificates, and the event-wide set-up. `?summary=1` returns
 * the totals only (the card on the event's manage page).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const data = await eventChecklist(id);
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const body = req.nextUrl.searchParams.get("summary")
    ? { totals: data.totals, todo: data.eventChecks.filter(c => c.state !== "done").length }
    : data;
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
