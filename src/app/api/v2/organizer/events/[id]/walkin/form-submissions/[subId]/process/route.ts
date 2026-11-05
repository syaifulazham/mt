import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { confirmTeamVerification, loadTeamSubmission, previewTeamVerification } from "@/lib/walkin-team-verify";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];

// GET ?participantId= — TEAM submissions only: what confirming with this
// participant would do (contingent, member matches, existing or new team).
// Read-only; POST runs the same check again.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, subId } = await params;

  const participantId = req.nextUrl.searchParams.get("participantId") ?? "";
  if (!participantId) return NextResponse.json({ error: "MISSING_PARTICIPANT" }, { status: 400 });

  const sub = await loadTeamSubmission(id, subId);
  if (!sub) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!sub.teamName) return NextResponse.json({ error: "NOT_A_TEAM_SUBMISSION" }, { status: 400 });

  const preview = await previewTeamVerification(sub, participantId);
  if ("notFound" in preview) return NextResponse.json({ error: "PARTICIPANT_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ data: preview });
}

// POST — process a pending form submission
// body: { action: "match", participantId }       — individual submissions
//     | { action: "match_team", participantId }  — team submissions
//     | { action: "no_match" }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id, subId } = await params;

  const body = await req.json().catch(() => ({}));
  const action = body.action;

  const sub = await db.walkInFormSubmission.findFirst({
    where: { id: subId, walkInCompetition: { eventId: id } },
    select: {
      id: true, status: true, walkInCompetitionId: true,
      sessionNumber: true, slotNumber: true, teamName: true,
      walkInCompetition: {
        select: { event: { select: { walkInUniqueParticipation: true } } },
      },
    },
  });
  if (!sub) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (sub.status !== "PENDING")
    return NextResponse.json({ error: "ALREADY_PROCESSED" }, { status: 409 });

  if (action === "no_match") {
    await db.walkInFormSubmission.update({
      where: { id: sub.id },
      data: { status: "NO_MATCH", processedAt: new Date() },
    });
    return NextResponse.json({ success: true, status: "NO_MATCH" });
  }

  if (action === "match_team") {
    if (!sub.teamName || !body.participantId)
      return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
    return confirmTeam(id, sub.id, String(body.participantId));
  }

  if (action !== "match" || !body.participantId)
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  if (sub.teamName) return NextResponse.json({ error: "TEAM_SUBMISSION" }, { status: 400 });

  const participant = await db.participant.findUnique({
    where: { id: body.participantId },
    select: { id: true, contingentId: true },
  });
  if (!participant) return NextResponse.json({ error: "PARTICIPANT_NOT_FOUND" }, { status: 404 });

  // Penyertaan Unik: one active walk-in registration per participant per event
  if (sub.walkInCompetition.event.walkInUniqueParticipation) {
    const existing = await db.walkInRegistration.findFirst({
      where: {
        participantId: participant.id,
        status: { in: ["PENDING", "CONFIRMED"] },
        walkInCompetition: { eventId: id },
      },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ error: "UNIQUE_PARTICIPATION" }, { status: 409 });
  }

  // Slot must still be free (the submission's own PENDING reservation is excluded by status change)
  if (sub.sessionNumber != null && sub.slotNumber != null) {
    const taken = await db.walkInRegistration.findFirst({
      where: {
        walkInCompetitionId: sub.walkInCompetitionId,
        sessionNumber: sub.sessionNumber,
        slotNumber: sub.slotNumber,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      select: { id: true },
    });
    if (taken) return NextResponse.json({ error: "SLOT_TAKEN" }, { status: 409 });
  }

  try {
    const [reg] = await db.$transaction([
      db.walkInRegistration.create({
        data: {
          walkInCompetitionId: sub.walkInCompetitionId,
          participantId: participant.id,
          contingentId: participant.contingentId,
          status: "CONFIRMED",
          method: "COUNTER",
          confirmedAt: new Date(),
          ...(sub.sessionNumber != null && sub.slotNumber != null && {
            sessionNumber: sub.sessionNumber,
            slotNumber: sub.slotNumber,
          }),
        },
        select: { id: true, status: true },
      }),
      db.walkInFormSubmission.update({
        where: { id: sub.id },
        data: {
          status: "PROCESSED",
          participantId: participant.id,
          processedAt: new Date(),
        },
      }),
    ]);

    await db.walkInFormSubmission.update({
      where: { id: sub.id },
      data: { walkInRegistrationId: reg.id },
    });

    return NextResponse.json({ success: true, status: "PROCESSED", registrationId: reg.id });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target as string[] | undefined) ?? [];
      if (target.includes("sessionNumber"))
        return NextResponse.json({ error: "SLOT_TAKEN" }, { status: 409 });
      return NextResponse.json({ error: "ALREADY_REGISTERED" }, { status: 409 });
    }
    throw e;
  }
}

/** Team confirm: the work lives in src/lib/walkin-team-verify.ts. */
async function confirmTeam(eventId: string, subId: string, participantId: string) {
  const r = await confirmTeamVerification(eventId, subId, participantId);
  if ("error" in r) return NextResponse.json({ error: r.error, detail: r.detail }, { status: r.status });
  return NextResponse.json({ success: true, status: "PROCESSED", ...r });
}
