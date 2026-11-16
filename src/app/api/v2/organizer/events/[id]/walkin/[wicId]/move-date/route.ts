import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isValidSlotScheduleConfig, eventSlotDates } from "@/lib/walkin-slots";
import { isSlotConflict, planDateMove } from "@/lib/walkin-slot-server";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// POST { from, to, apply? } — move every active booking of one event day to
// another, filling free slots (planDateMove). Without `apply` it only returns
// the plan; with `apply` it recomputes the plan and saves it in one transaction.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; wicId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, wicId } = await params;
  const body = await req.json().catch(() => ({}));
  const apply = body.apply === true;
  if (apply && !WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const wic = await db.eventWalkInCompetition.findFirst({
    where: { id: wicId, eventId: id },
    select: { walkInSlotSchedule: true, event: { select: { startDate: true, endDate: true } } },
  });
  if (!wic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const cfg = isValidSlotScheduleConfig(wic.walkInSlotSchedule) ? wic.walkInSlotSchedule : null;
  if (!cfg) return NextResponse.json({ error: "Jadual slot belum ditetapkan" }, { status: 400 });

  const days = eventSlotDates(wic.event.startDate, wic.event.endDate);
  const { from, to } = body as { from?: unknown; to?: unknown };
  if (typeof from !== "string" || typeof to !== "string" || !days.includes(from) || !days.includes(to) || from === to)
    return NextResponse.json({ error: "Pilih dua tarikh acara yang berbeza" }, { status: 400 });

  const plan = await planDateMove(wicId, cfg, from, to);
  if (!apply) return NextResponse.json({ data: plan });

  try {
    await db.$transaction(async (tx) => {
      for (const p of plan) {
        if (!p.to) continue;
        const data = { slotDate: to, sessionNumber: p.to.sessionNumber, slotNumber: p.to.slotNumber };
        if (p.kind === "registration")
          await tx.walkInRegistration.updateMany({ where: { id: p.id, slotDate: from, status: { in: ["PENDING", "CONFIRMED"] } }, data });
        else
          await tx.walkInFormSubmission.updateMany({ where: { id: p.id, slotDate: from, status: "PENDING" }, data });
      }
    });
  } catch (e) {
    if (isSlotConflict(e)) return NextResponse.json({ error: "Slot berubah semasa memindah — cuba semula" }, { status: 409 });
    throw e;
  }
  const moved = plan.filter((p) => p.to).length;
  return NextResponse.json({ data: { moved, unplaced: plan.length - moved, plan } });
}
