import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { viblockCompetitionRegister, viblockConfigured } from "@/lib/viblock";

// POST — confirm a PENDING portal registration by scanning QR at the counter
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { registrationId, passcode } = await req.json();

  if (!registrationId) return NextResponse.json({ error: "MISSING_REGISTRATION_ID" }, { status: 400 });

  const endpoint = await db.walkInEndpoint.findUnique({
    where: { routeSlug: slug },
    select: { id: true, passcode: true, active: true, walkInCompetitionId: true, eventId: true },
  });

  if (!endpoint || !endpoint.active)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!endpoint.passcode || endpoint.passcode !== passcode)
    return NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 403 });

  const reg = await db.walkInRegistration.findUnique({
    where: { id: registrationId },
    select: {
      id: true, walkInCompetitionId: true, participantId: true, status: true, confirmedAt: true, viblockToken: true,
      participant: {
        select: {
          name: true, ic: true, gender: true, eduLevel: true, classGrade: true,
          contingent: {
            select: {
              name: true,
              state: { select: { name: true } },
            },
          },
        },
      },
      contingent: { select: { name: true, shortName: true, logoUrl: true } },
      walkInCompetition: {
        select: {
          eventId: true,
          useViblockarena: true,
          competition: { select: { code: true, name: true } },
          event: { select: { name: true } },
        },
      },
    },
  });

  if (!reg) return NextResponse.json({ error: "REGISTRATION_NOT_FOUND" }, { status: 404 });

  // For specific endpoints: must match the wic. For general endpoints: must belong to same event.
  if (endpoint.walkInCompetitionId !== null) {
    if (reg.walkInCompetitionId !== endpoint.walkInCompetitionId)
      return NextResponse.json({ error: "REGISTRATION_MISMATCH" }, { status: 400 });
  } else {
    if (reg.walkInCompetition?.eventId !== endpoint.eventId)
      return NextResponse.json({ error: "REGISTRATION_MISMATCH" }, { status: 400 });
  }

  const alreadyConfirmed = reg.status === "CONFIRMED";
  let viblockToken: string | null = reg.viblockToken;

  if (!alreadyConfirmed) {
    if (reg.status !== "PENDING")
      return NextResponse.json({ error: "CANNOT_CONFIRM", message: `Status adalah ${reg.status}` }, { status: 409 });

    // Register to Viblock Arena if configured, enabled, and not already registered
    if (!viblockToken && reg.walkInCompetition?.useViblockarena && viblockConfigured()) {
      try {
        const vRes = await viblockCompetitionRegister({
          sector: reg.participant.contingent?.name ?? reg.contingent.name,
          region: reg.participant.contingent?.state?.name ?? "",
          name:   reg.participant.name,
        });
        viblockToken = vRes.token;
      } catch (e) {
        console.error("[viblock] competition register on confirm failed:", e);
      }
    }

    await db.walkInRegistration.update({
      where: { id: registrationId },
      data: { status: "CONFIRMED", confirmedAt: new Date(), viblockToken },
    });
  }

  return NextResponse.json({
    data: {
      id:             reg.id,
      alreadyConfirmed,
      viblockToken,
      participantName: reg.participant.name,
      ic:              reg.participant.ic ? `••••••-••-${reg.participant.ic.slice(-4)}` : null,
      gender:          reg.participant.gender,
      eduLevel:        reg.participant.eduLevel,
      classGrade:      reg.participant.classGrade,
      contingentName:  reg.contingent.name,
      contingentLogo:  reg.contingent.logoUrl ?? null,
      competitionCode: reg.walkInCompetition?.competition.code ?? "",
      competitionName: reg.walkInCompetition?.competition.name ?? "",
      eventName:       reg.walkInCompetition?.event.name ?? "",
    },
  });
}
