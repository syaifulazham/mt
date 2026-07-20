import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { viblockConfigured, viblockCompetitionRegister, viblockGetToken, viblockRenewToken } from "@/lib/viblock";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// GET — get token info for this registration
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string; regId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { regId } = await params;

  const reg = await db.walkInRegistration.findUnique({
    where: { id: regId },
    select: { viblockToken: true },
  });
  if (!reg) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!reg.viblockToken) return NextResponse.json({ error: "NO_TOKEN" }, { status: 404 });

  try {
    const data = await viblockGetToken(reg.viblockToken);
    return NextResponse.json(data);
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ error: err.message ?? "Failed" }, { status: err.status ?? 502 });
  }
}

// POST — register to viblock arena (for participants without a token)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string; regId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!viblockConfigured()) return NextResponse.json({ error: "VIBLOCK_NOT_CONFIGURED" }, { status: 400 });
  const { regId } = await params;

  const reg = await db.walkInRegistration.findUnique({
    where: { id: regId },
    include: {
      participant: { select: { name: true } },
      contingent: { select: { name: true, shortName: true } },
      walkInCompetition: { select: { event: { select: { name: true } } } },
    },
  });
  if (!reg) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (reg.viblockToken) return NextResponse.json({ error: "ALREADY_REGISTERED", token: reg.viblockToken }, { status: 409 });

  try {
    const result = await viblockCompetitionRegister({
      sector: reg.contingent?.shortName ?? reg.contingent?.name ?? "Unknown",
      region: reg.walkInCompetition?.event?.name ?? "Unknown",
      name: reg.participant.name,
    });

    await db.walkInRegistration.update({
      where: { id: regId },
      data: { viblockToken: result.token },
    });

    return NextResponse.json({ token: result.token, registration_id: result.registration_id });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ error: err.message ?? "Registration failed" }, { status: err.status ?? 502 });
  }
}

// PATCH — renew token
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string; regId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!viblockConfigured()) return NextResponse.json({ error: "VIBLOCK_NOT_CONFIGURED" }, { status: 400 });
  const { regId } = await params;

  const reg = await db.walkInRegistration.findUnique({
    where: { id: regId },
    select: { viblockToken: true },
  });
  if (!reg) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!reg.viblockToken) return NextResponse.json({ error: "NO_TOKEN" }, { status: 400 });

  try {
    const result = await viblockRenewToken(reg.viblockToken);

    await db.walkInRegistration.update({
      where: { id: regId },
      data: { viblockToken: result.token },
    });

    return NextResponse.json({ old_token: result.old_token, token: result.token });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ error: err.message ?? "Renewal failed" }, { status: err.status ?? 502 });
  }
}
