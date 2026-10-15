import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { transitionJudging } from "@/lib/judgingStatus";

/**
 * PATCH { action: "complete" | "verify" | "reopen", stateId? } — move one
 * event-competition through its judging lifecycle. Rules (roles, allowed
 * transitions, reopening the judges' task announcements) live in
 * transitionJudging, shared with walk-in judging.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; ecId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId, ecId } = await params;
  // stateId absent = the national "Semua" row; otherwise that state's row.
  const { action, stateId } = await req.json().catch(() => ({})) as { action?: string; stateId?: string | null };
  const r = await transitionJudging("event", eventId, ecId, action, session, stateId);
  return NextResponse.json(r.body, { status: r.status });
}
