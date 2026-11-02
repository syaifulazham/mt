import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";

// Dashboard "Stats Snapshot". A Super Admin chooses whether the organizer
// dashboard (Overview, View by Zone, View by State) shows live data or a saved
// snapshot. The choice is global (app_settings), so every organizer sees the
// same figures. A snapshot stores the exact JSON each live endpoint returned.

export const SOURCE_SETTING_KEY = "dashboard_data_source";
/** Sent by the snapshot builder so the endpoints compute live data. */
export const LIVE_HEADER = "x-dashboard-live";

export type DashboardSource = { mode: "live" } | { mode: "snapshot"; snapshotId: string };

export async function getDashboardSource(): Promise<DashboardSource> {
  const row = await db.appSetting.findUnique({ where: { key: SOURCE_SETTING_KEY } });
  try {
    const v = row ? JSON.parse(row.value) : null;
    if (v?.mode === "snapshot" && typeof v.snapshotId === "string") return { mode: "snapshot", snapshotId: v.snapshotId };
  } catch { /* fall back to live */ }
  return { mode: "live" };
}

export async function setDashboardSource(source: DashboardSource): Promise<void> {
  const value = JSON.stringify(source);
  await db.appSetting.upsert({ where: { key: SOURCE_SETTING_KEY }, update: { value }, create: { key: SOURCE_SETTING_KEY, value } });
}

/**
 * When the dashboard is set to a READY snapshot that holds `part`, the stored
 * response (with a `snapshot` marker); otherwise null and the endpoint computes
 * live. The builder's own requests (LIVE_HEADER) always get live data.
 */
export async function snapshotResponse(req: NextRequest | undefined, part: string): Promise<NextResponse | null> {
  if (req?.headers.get(LIVE_HEADER) === "1") return null;
  const source = await getDashboardSource();
  if (source.mode !== "snapshot") return null;
  const snap = await db.dashboardSnapshot.findUnique({ where: { id: source.snapshotId } });
  if (!snap || snap.status !== "READY") return null;
  const data = (snap.parts as Record<string, unknown>)[part];
  if (data == null || typeof data !== "object") return null;
  return NextResponse.json({
    ...(data as Record<string, unknown>),
    snapshot: { id: snap.id, label: snap.label, createdAt: snap.createdAt },
  });
}
