import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST — confirm a PENDING portal registration by scanning QR at the counter
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { registrationId, passcode } = await req.json();

  if (!registrationId) return NextResponse.json({ error: "MISSING_REGISTRATION_ID" }, { status: 400 });

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { routeSlug: slug },
    select: { id: true, passcode: true, endpointActive: true },
  });

  if (!wic || !wic.endpointActive)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!wic.passcode || wic.passcode !== passcode)
    return NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 403 });

  const reg = await db.walkInRegistration.findUnique({
    where: { id: registrationId },
    select: { id: true, walkInCompetitionId: true, status: true, participant: { select: { name: true } } },
  });

  if (!reg) return NextResponse.json({ error: "REGISTRATION_NOT_FOUND" }, { status: 404 });
  if (reg.walkInCompetitionId !== wic.id)
    return NextResponse.json({ error: "REGISTRATION_MISMATCH" }, { status: 400 });
  if (reg.status === "CONFIRMED")
    return NextResponse.json({ data: reg, message: "Already confirmed" });
  if (reg.status !== "PENDING")
    return NextResponse.json({ error: "CANNOT_CONFIRM", message: `Status is ${reg.status}` }, { status: 409 });

  const updated = await db.walkInRegistration.update({
    where: { id: registrationId },
    data: { status: "CONFIRMED", confirmedAt: new Date() },
    include: { participant: { select: { name: true, ic: true } }, contingent: { select: { name: true } } },
  });

  return NextResponse.json({ data: updated });
}
