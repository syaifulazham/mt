import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { Prisma } from "@prisma/client";
import { isValidSlotScheduleConfig } from "@/lib/walkin-slots";
import { claimSlot, isSlotConflict, slotDatesOf } from "@/lib/walkin-slot-server";
import { createWalkInSubmission } from "@/lib/walkin-submission";
import { cleanIc, IC_RE, registrationHasIc, submissionHasIc } from "@/lib/walkin-team";

// POST — pre-register for a walk-in competition from the portal dashboard.
// INDIVIDUAL: creates a PENDING registration for the participant (confirmed at
// the counter). TEAM: creates a temporary-team form submission (body adds
// { teamName, members: [{ ic, name }] }, the participant among them), which the
// organizer verifies in "Proses Borang" like a public borang entry.

export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  const { walkInCompetitionId } = body as { walkInCompetitionId?: string };
  if (!walkInCompetitionId)
    return NextResponse.json({ error: "MISSING_WALK_IN_COMPETITION_ID" }, { status: 400 });

  // Verify EventWalkInCompetition exists and is published to portal
  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: walkInCompetitionId },
    select: {
      id: true,
      maxSlots: true,
      publishToPortal: true,
      event: { select: { id: true, walkInUniqueParticipation: true, startDate: true, endDate: true } },
      competition: { select: { participationType: true } },
      walkInSlotSchedule: true,
      _count: { select: { registrations: true } },
    },
  });

  if (!wic || !wic.publishToPortal)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Check slots
  if (wic.maxSlots > 0 && wic._count.registrations >= wic.maxSlots)
    return NextResponse.json({ error: "SLOTS_FULL" }, { status: 409 });

  const { participantId, contingentId } = session;
  const selfIc = cleanIc(session.ic ?? "");

  if (wic.competition.participationType === "TEAM") {
    if (!IC_RE.test(selfIc)) return NextResponse.json({ error: "NO_IC" }, { status: 400 });
    const contingent = await db.contingent.findUnique({ where: { id: contingentId }, select: { name: true } });
    const r = await createWalkInSubmission({
      endpointId: null,
      eventId: wic.event.id,
      uniqueParticipation: wic.event.walkInUniqueParticipation,
      walkInCompetitionId,
      body: { ...body, schoolName: contingent?.name ?? null },
      selfIc,
    });
    return NextResponse.json(r.json, { status: r.status });
  }

  // Slot selection (and, on multi-day events, a date) required when a slot schedule is configured
  const rawCfg = wic.walkInSlotSchedule;
  const scheduleCfg = isValidSlotScheduleConfig(rawCfg) ? rawCfg : null;
  const claimed = await claimSlot(walkInCompetitionId, scheduleCfg, slotDatesOf(wic.event, scheduleCfg), body);
  if ("error" in claimed) return NextResponse.json({ error: claimed.error }, { status: claimed.status });

  // Penyertaan Unik: one active walk-in entry per participant per event —
  // their own registration, a team registration they are on, or a pending
  // team entry listing their IC.
  if (wic.event.walkInUniqueParticipation) {
    const [existing, pendingTeam] = await Promise.all([
      db.walkInRegistration.findFirst({
        where: {
          OR: [{ participantId }, ...(selfIc ? [registrationHasIc(selfIc)] : [])],
          status: { in: ["PENDING", "CONFIRMED"] },
          walkInCompetition: { eventId: wic.event.id },
        },
        select: { id: true },
      }),
      selfIc
        ? db.walkInFormSubmission.findFirst({
            where: {
              ...submissionHasIc(selfIc),
              status: { in: ["PENDING", "PROCESSED"] },
              walkInCompetition: { eventId: wic.event.id },
            },
            select: { id: true },
          })
        : null,
    ]);
    if (existing || pendingTeam) return NextResponse.json({ error: "UNIQUE_PARTICIPATION" }, { status: 409 });
  }

  try {
    const reg = await db.walkInRegistration.create({
      data: {
        walkInCompetitionId,
        participantId,
        contingentId,
        status: "PENDING",
        method: "PORTAL",
        ...claimed.slot,
      },
      select: { id: true, status: true, slotDate: true, sessionNumber: true, slotNumber: true },
    });
    return NextResponse.json({ data: reg }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      if (isSlotConflict(e))
        return NextResponse.json({ error: "SLOT_TAKEN" }, { status: 409 });
      return NextResponse.json({ error: "ALREADY_REGISTERED" }, { status: 409 });
    }
    throw e;
  }
}
