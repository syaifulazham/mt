import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getDashboardSource, setDashboardSource } from "@/lib/dashboardSnapshot";

export const dynamic = "force-dynamic";

const SNAPSHOT_SELECT = { id: true, label: true, status: true, partCount: true, createdBy: true, createdAt: true, completedAt: true } as const;

/** GET — the dashboard's data source (any organizer) and, for a Super Admin, the saved snapshots. */
export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const source = await getDashboardSource();
  const active = source.mode === "snapshot"
    ? await db.dashboardSnapshot.findUnique({ where: { id: source.snapshotId }, select: SNAPSHOT_SELECT })
    : null;
  const snapshots = session.role === "SUPER_ADMIN"
    ? await db.dashboardSnapshot.findMany({ select: SNAPSHOT_SELECT, orderBy: { createdAt: "desc" } })
    : undefined;
  return NextResponse.json(
    { source: active?.status === "READY" ? source : { mode: "live" }, active: active?.status === "READY" ? active : null, snapshots },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** POST { label? } — start a new snapshot (Super Admin); returns the parts to build, in order. */
export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { label } = await req.json().catch(() => ({})) as { label?: string };
  const [zones, states] = await Promise.all([
    db.zone.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.state.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const parts = [
    { key: "overview", label: "Overview" },
    { key: "zones",    label: "View by Zone — ringkasan" },
    ...zones.map(z => ({ key: `zone:${z.id}`, label: `Zon: ${z.name}` })),
    { key: "states",   label: "View by State — ringkasan" },
    ...states.map(s => ({ key: `state:${s.id}`, label: `Negeri: ${s.name}` })),
  ];
  const snapshot = await db.dashboardSnapshot.create({
    data: { label: label?.trim() || null, createdBy: session.name || session.email, partCount: parts.length },
    select: SNAPSHOT_SELECT,
  });
  return NextResponse.json({ snapshot, parts }, { status: 201 });
}

/** PATCH { mode: "live" } | { mode: "snapshot", snapshotId } — what the dashboard shows (Super Admin). */
export async function PATCH(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { mode?: string; snapshotId?: string };
  if (body.mode === "live") {
    await setDashboardSource({ mode: "live" });
  } else if (body.mode === "snapshot" && body.snapshotId) {
    const snap = await db.dashboardSnapshot.findUnique({ where: { id: body.snapshotId }, select: { status: true } });
    if (snap?.status !== "READY") return NextResponse.json({ error: "Snapshot belum siap." }, { status: 409 });
    await setDashboardSource({ mode: "snapshot", snapshotId: body.snapshotId });
  } else {
    return NextResponse.json({ error: "INVALID_MODE" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, source: await getDashboardSource() });
}
