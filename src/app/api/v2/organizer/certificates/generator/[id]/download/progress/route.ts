import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { getProgress } from "@/lib/certificates/bulk-download";

export const dynamic = "force-dynamic";

// GET ?token= — progress of a running ZIP download: PDFs done / total, and
// whether it finished (or failed). Null until the download has started.
export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const token = req.nextUrl.searchParams.get("token") ?? "";
  return NextResponse.json({ progress: token ? getProgress(token) : null }, { headers: { "Cache-Control": "no-store" } });
}
