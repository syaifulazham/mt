import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { csiConfigured } from "@/lib/eptim-csi";
import { csiMonitor } from "@/lib/csiMonitor";

export const dynamic = "force-dynamic";

// GET — the event's Eptim CSI competitions: teams registered per case, with progress
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!csiConfigured()) return NextResponse.json({ error: "Eptim CSI belum dikonfigurasi (EPTIMCSI_APP_URL / EPTIMCSI_API_KEY)." }, { status: 503 });

  const { id: eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json(
    { competitions: await csiMonitor(eventId), fetchedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
