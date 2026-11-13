import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { loadKeyed, parseDownloadParams, planOf } from "@/lib/certificates/bulk-download";

export const dynamic = "force-dynamic";
const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// GET (same query as ../download) — what the download would produce: totals,
// the ZIPs of the split (key, certificates, PDFs) and the values each filter
// offers with their counts. Nothing is rendered.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  if (!(await db.certGeneratorJob.findUnique({ where: { id }, select: { id: true } })))
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const { format, chunkBy, filters } = parseDownloadParams(req.nextUrl.searchParams);
  const plan = planOf(await loadKeyed(id, filters.q), filters, format, chunkBy);
  return NextResponse.json(plan, { headers: { "Cache-Control": "no-store" } });
}
