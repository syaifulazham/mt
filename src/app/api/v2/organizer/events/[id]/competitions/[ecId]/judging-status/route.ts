import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { transitionJudging } from "@/lib/judgingStatus";

/**
 * PATCH { action: "complete" | "verify" | "reopen" } — move one
 * event-competition through its judging lifecycle. Rules (roles, allowed
 * transitions, reopening the judges' task announcements) live in
 * transitionJudging, shared with walk-in judging.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; ecId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId, ecId } = await params;
  const { action } = await req.json().catch(() => ({})) as { action?: string };
  const r = await transitionJudging("event", eventId, ecId, action, session);
  return NextResponse.json(r.body, { status: r.status });
}
