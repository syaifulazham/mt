import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * PATCH { action: "complete" | "verify" | "reopen" } — move one
 * event-competition through its judging lifecycle (see lib/judgingStatus.ts).
 *
 *   complete  OPEN      → COMPLETED   Super Admin, Admin   (locks judge forms)
 *   verify    COMPLETED → VERIFIED    Super Admin
 *   reopen    COMPLETED / VERIFIED → OPEN   Super Admin  (unlocks; clears verification)
 *
 * Each transition is a conditional update on the expected current status, so
 * two people clicking at once can't skip a step or verify a reopened judging.
 */
const TRANSITIONS = {
  complete: { from: ["OPEN"],                  roles: ["SUPER_ADMIN", "ADMIN"] },
  verify:   { from: ["COMPLETED"],             roles: ["SUPER_ADMIN"] },
  reopen:   { from: ["COMPLETED", "VERIFIED"], roles: ["SUPER_ADMIN"] },
} as const;
type Action = keyof typeof TRANSITIONS;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; ecId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId, ecId } = await params;
  const { action } = await req.json().catch(() => ({})) as { action?: string };
  if (!action || !(action in TRANSITIONS)) return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  const t = TRANSITIONS[action as Action];
  if (!(t.roles as readonly string[]).includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const now = new Date();
  const by  = session.name || session.email;
  const data =
    action === "complete" ? { judgingStatus: "COMPLETED", judgingCompletedAt: now, judgingCompletedBy: by,
                              judgingVerifiedAt: null, judgingVerifiedBy: null }
    : action === "verify" ? { judgingStatus: "VERIFIED", judgingVerifiedAt: now, judgingVerifiedBy: by }
    :                       { judgingStatus: "OPEN", judgingCompletedAt: null, judgingCompletedBy: null,
                              judgingVerifiedAt: null, judgingVerifiedBy: null };

  const { count } = await db.eventCompetition.updateMany({
    where: { id: ecId, eventId, judgingStatus: { in: [...t.from] } },
    data,
  });
  if (count === 0) {
    const ec = await db.eventCompetition.findFirst({ where: { id: ecId, eventId }, select: { judgingStatus: true } });
    if (!ec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json(
      { error: "INVALID_STATE", message: `Status penghakiman semasa ialah ${ec.judgingStatus}. Muat semula halaman.` },
      { status: 409 },
    );
  }
  // Reopening the competition reopens the judges' own task announcements too,
  // otherwise those forms would stay locked.
  if (action === "reopen")
    await db.judgingTask.updateMany({ where: { eventCompetitionId: ecId }, data: { completedAt: null } });

  const ec = await db.eventCompetition.findUnique({
    where: { id: ecId },
    select: {
      judgingStatus: true, judgingCompletedAt: true, judgingCompletedBy: true,
      judgingVerifiedAt: true, judgingVerifiedBy: true,
    },
  });
  return NextResponse.json({ judging: ec });
}
