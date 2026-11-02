import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { LIVE_HEADER, getDashboardSource, setDashboardSource } from "@/lib/dashboardSnapshot";
import { GET as overviewGET } from "@/app/api/v2/organizer/dashboard/route";
import { GET as zonesGET } from "@/app/api/v2/organizer/dashboard/zones/route";
import { GET as zoneGET } from "@/app/api/v2/organizer/dashboard/zones/[id]/route";
import { GET as statesGET } from "@/app/api/v2/organizer/dashboard/states/route";
import { GET as stateGET } from "@/app/api/v2/organizer/dashboard/states/[id]/route";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST { part } — build one part of a snapshot: run the live dashboard endpoint
 * for it and store its JSON. { part: "finalize" } marks the snapshot READY.
 * The client calls this part by part, which is what drives its progress view.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const { part } = await req.json().catch(() => ({})) as { part?: string };
  const snap = await db.dashboardSnapshot.findUnique({ where: { id }, select: { status: true, partCount: true, parts: true } });
  if (!snap) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (snap.status !== "BUILDING") return NextResponse.json({ error: "Snapshot ini sudah selesai dibina." }, { status: 409 });
  if (!part) return NextResponse.json({ error: "MISSING_PART" }, { status: 400 });

  if (part === "finalize") {
    const built = Object.keys(snap.parts as object).length;
    if (built < snap.partCount)
      return NextResponse.json({ error: `Hanya ${built}/${snap.partCount} bahagian dibina.` }, { status: 409 });
    await db.dashboardSnapshot.update({ where: { id }, data: { status: "READY", completedAt: new Date() } });
    return NextResponse.json({ ok: true, status: "READY" });
  }

  // Live data: the builder's request carries LIVE_HEADER and the caller's cookies
  const liveReq = new NextRequest(req.url, { headers: { ...Object.fromEntries(req.headers), [LIVE_HEADER]: "1" } });
  const [kind, refId] = part.split(":");
  const res =
    kind === "overview" ? await overviewGET(liveReq)
    : kind === "zones"  ? await zonesGET(liveReq)
    : kind === "states" ? await statesGET(liveReq)
    : kind === "zone"  && refId ? await zoneGET(liveReq, { params: Promise.resolve({ id: refId }) })
    : kind === "state" && refId ? await stateGET(liveReq, { params: Promise.resolve({ id: refId }) })
    : null;
  if (!res) return NextResponse.json({ error: "UNKNOWN_PART" }, { status: 400 });
  if (!res.ok) {
    await db.dashboardSnapshot.update({ where: { id }, data: { status: "FAILED" } });
    return NextResponse.json({ error: `Gagal membina ${part} (${res.status}).` }, { status: 502 });
  }
  const data = await res.json();

  // Merge this part in (one statement, so parallel builds can't overwrite each other)
  await db.$executeRaw`
    UPDATE dashboard_snapshots
    SET parts = parts || jsonb_build_object(${part}::text, ${JSON.stringify(data)}::jsonb)
    WHERE id = ${id}`;
  return NextResponse.json({ ok: true, part, bytes: JSON.stringify(data).length });
}

/** DELETE — remove a snapshot (Super Admin). If it is in use, the dashboard returns to live data. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const source = await getDashboardSource();
  if (source.mode === "snapshot" && source.snapshotId === id) await setDashboardSource({ mode: "live" });
  await db.dashboardSnapshot.delete({ where: { id } }).catch((e: unknown) => {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")) throw e;
  });
  return NextResponse.json({ ok: true });
}
