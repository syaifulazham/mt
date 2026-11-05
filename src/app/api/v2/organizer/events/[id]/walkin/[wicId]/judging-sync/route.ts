import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { scorePlatformLabel } from "@/lib/walkin-score-template";
import {
  ensureSyncEndpoint, platformReady, resolveScorePlatform, suitableAssignedTemplate, syncBatch, syncLabel,
} from "@/lib/walkin-score-sync";
import { vibeBlocksErrorMessage } from "@/lib/vibeblocks";

// Sync a walk-in competition's results from its game platform into walk-in
// judging scores (src/lib/walkin-score-sync.ts).
// GET  — can it sync: platform, suitable assigned template, sync endpoint.
// POST { action: "prepare" }        — find or create the sync endpoint.
// POST { action: "sync", offset }   — sync one batch; repeat while nextOffset.

export const maxDuration = 120;
const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];
type Params = { params: Promise<{ id: string; wicId: string }> };

async function context(eventId: string, wicId: string) {
  const r = await resolveScorePlatform(eventId, wicId);
  if ("error" in r) return { fail: NextResponse.json({ error: r.error, ...("message" in r && { message: r.message }) }, { status: r.status }) };
  const template = await suitableAssignedTemplate(r);
  return { r, template };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, wicId } = await params;
  const ctx = await context(id, wicId);
  if ("fail" in ctx) return ctx.fail;
  const { r, template } = ctx;
  return NextResponse.json({
    platform: scorePlatformLabel(r.provider),
    syncLabel: syncLabel(r.provider),
    template: template && { id: template.id, name: template.name, code: template.code },
    notReady: platformReady(r),
    judgingLocked: r.wic.judgingStatus !== "OPEN",
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id, wicId } = await params;
  const body = await req.json().catch(() => ({})) as { action?: string; offset?: number };
  const ctx = await context(id, wicId);
  if ("fail" in ctx) return ctx.fail;
  const { r, template } = ctx;

  if (!template)
    return NextResponse.json({ error: "NO_SUITABLE_TEMPLATE", message: "Tiada templat skor yang sesuai ditetapkan. Gunakan \"Cari templat skor platform\" di halaman walk-in." }, { status: 409 });
  if (r.wic.judgingStatus !== "OPEN")
    return NextResponse.json({ error: "JUDGING_LOCKED", message: "Penghakiman telah diumumkan selesai; buka semula untuk menyegerak." }, { status: 423 });
  const notReady = platformReady(r);
  if (notReady) return NextResponse.json({ error: "PLATFORM_NOT_READY", message: notReady }, { status: 409 });

  const { endpoint, created } = await ensureSyncEndpoint(id, r, template.id);
  if (body.action === "prepare") return NextResponse.json({ endpoint, created, template: { id: template.id, name: template.name, code: template.code } });

  if (body.action !== "sync") return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  if (endpoint.completedAt)
    return NextResponse.json({ error: "ENDPOINT_COMPLETED", message: `Endpoint "${endpoint.label}" telah diumumkan selesai; buka semula untuk menyegerak.` }, { status: 423 });
  try {
    const out = await syncBatch(r, r.spec, endpoint.id, template, Math.max(0, Number(body.offset) || 0));
    return NextResponse.json(out);
  } catch (e) {
    console.error(`[${r.provider}] judging sync failed:`, e);
    const p = r.provider === "drone" || r.provider === "viblock" ? undefined : r.provider;
    return NextResponse.json({
      error: "PLATFORM_ERROR",
      message: p ? vibeBlocksErrorMessage(e, p) : `Gagal mengambil keputusan daripada ${scorePlatformLabel(r.provider)}.`,
    }, { status: 502 });
  }
}
