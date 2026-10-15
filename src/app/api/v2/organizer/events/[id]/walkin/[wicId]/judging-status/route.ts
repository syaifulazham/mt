import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { transitionJudging } from "@/lib/judgingStatus";

/**
 * PATCH { action: "complete" | "verify" | "reopen" } — walk-in counterpart of
 * competitions/[ecId]/judging-status: complete (Admin, Super Admin) locks every
 * walk-in judging form of the competition; verify and reopen are Super Admin only.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; wicId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId, wicId } = await params;
  const { action } = await req.json().catch(() => ({})) as { action?: string };
  const r = await transitionJudging("walkin", eventId, wicId, action, session);
  return NextResponse.json(r.body, { status: r.status });
}
