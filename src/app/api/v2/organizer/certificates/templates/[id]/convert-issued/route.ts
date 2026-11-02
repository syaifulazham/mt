import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

/**
 * Issued certificates normally keep the template version they were issued
 * against, so a later edit never changes them. This is the deliberate,
 * admin-only exception — for correcting a layout before certificates go out:
 *
 *   GET  → issued certificates per version and how many are on an older one
 *   POST → move every non-revoked certificate on an older version to the
 *          current version (serial numbers, codes and data are unchanged)
 *
 * Refused for archived seasons, whose certificates are final.
 */
async function load(id: string) {
  const template = await db.certTemplate.findUnique({
    where:   { id },
    include: { season: { select: { archivedAt: true } }, versions: { select: { id: true, version: true } } },
  });
  if (!template) return null;
  const counts = await db.certificate.groupBy({
    by: ["templateVersionId"],
    where: { templateVersionId: { in: template.versions.map(v => v.id) }, status: { not: "REVOKED" } },
    _count: { _all: true },
  });
  const current = template.versions.find(v => v.id === template.currentVersionId) ?? null;
  const byVersion = template.versions
    .map(v => ({ version: v.version, count: counts.find(c => c.templateVersionId === v.id)?._count._all ?? 0 }))
    .filter(v => v.count > 0)
    .sort((a, b) => a.version - b.version);
  const outdated = byVersion.filter(v => v.version !== current?.version).reduce((s, v) => s + v.count, 0);
  return { template, current, byVersion, outdated };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const s = await load((await params).id);
  if (!s) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(
    { current: s.current, byVersion: s.byVersion, outdated: s.outdated, archived: !!s.template.season.archivedAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const s = await load((await params).id);
  if (!s) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (s.template.season.archivedAt)
    return NextResponse.json({ error: "Musim telah diarkibkan — sijilnya muktamad." }, { status: 409 });
  if (!s.current) return NextResponse.json({ error: "Templat belum diterbitkan." }, { status: 400 });

  const older = s.template.versions.filter(v => v.id !== s.current!.id).map(v => v.id);
  const { count } = await db.certificate.updateMany({
    where: { templateVersionId: { in: older }, status: { not: "REVOKED" } },
    data:  { templateVersionId: s.current.id },
  });
  console.warn(
    `[certificates] ${session.name || session.email} (${session.role}) converted ${count} issued certificates of ` +
    `template ${s.template.id} "${s.template.name}" to v${s.current.version} (from ${s.byVersion.filter(v => v.version !== s.current!.version).map(v => `v${v.version}:${v.count}`).join(", ") || "none"})`,
  );
  return NextResponse.json({ converted: count, version: s.current.version });
}
