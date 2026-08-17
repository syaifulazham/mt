import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  droneConfigured,
  droneRegisterParticipant,
  droneRefreshToken,
  droneListEndpoints,
  droneGetOrCreateCompetitionToken,
  droneRegenerateCompetitionToken,
  encodeDroneToken,
  parseDroneToken,
  deriveDroneUserId,
} from "@/lib/drone";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// GET — return parsed drone token info for this registration
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

  const parsed = parseDroneToken(reg.viblockToken);
  if (!parsed) return NextResponse.json({ error: "INVALID_TOKEN_FORMAT" }, { status: 422 });

  return NextResponse.json({
    userid: parsed.userid,
    password: parsed.password,
    accessToken: parsed.accessToken,
    competitionToken: parsed.competitionToken,
  });
}

// POST — register participant to drone; ?force=true re-registers even if already registered
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string; regId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!droneConfigured()) return NextResponse.json({ error: "DRONE_NOT_CONFIGURED" }, { status: 400 });
  const { regId } = await params;
  const force = req.nextUrl.searchParams.get("force") === "true";

  const reg = await db.walkInRegistration.findUnique({
    where: { id: regId },
    select: {
      participantId: true,
      contingentId: true,
      viblockToken: true,
      participant: {
        select: {
          name: true,
          contingent: {
            select: {
              name: true,
              state: { select: { name: true } },
            },
          },
        },
      },
      contingent: { select: { name: true } },
    },
  });
  if (!reg) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (reg.viblockToken && !force) return NextResponse.json({ error: "ALREADY_REGISTERED" }, { status: 409 });

  const sectorCustomId = (reg.contingentId ?? "").slice(-16);
  const droneUserId = deriveDroneUserId(reg.participantId);

  try {
    const result = await droneRegisterParticipant({
      sectorName:     reg.participant.contingent?.name ?? reg.contingent.name,
      sectorRegion:   reg.participant.contingent?.state?.name ?? "",
      sectorCustomId,
      userid:         droneUserId,
      fullName:       reg.participant.name,
    });

    // Try to generate a competition terminal token (optional — skip if no endpoint configured)
    let competitionToken: string | null = null;
    let endpointId: string | null = null;
    try {
      const { endpoints } = await droneListEndpoints();
      const activeEndpoint = endpoints.find(ep => ep.is_active);
      if (activeEndpoint) {
        const tokenData = await droneGetOrCreateCompetitionToken(activeEndpoint.id, droneUserId);
        competitionToken = tokenData.token;
        endpointId = activeEndpoint.id;
      }
    } catch {
      // Competition token is optional — proceed without it
    }

    const stored = encodeDroneToken(
      result.userid,
      result.password,
      result.accessToken,
      competitionToken ?? undefined,
      endpointId ?? undefined,
    );
    await db.walkInRegistration.update({
      where: { id: regId },
      data: { viblockToken: stored },
    });
    return NextResponse.json({
      userid: result.userid,
      password: result.password,
      accessToken: result.accessToken,
      competitionToken,
      endpointId,
    });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json(
      { error: err.message ?? "Drone registration failed" },
      { status: err.status ?? 502 },
    );
  }
}

// PATCH — refresh auth token; if user no longer exists on eptim-drone, re-register them
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; wicId: string; regId: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!droneConfigured()) return NextResponse.json({ error: "DRONE_NOT_CONFIGURED" }, { status: 400 });
  const { regId } = await params;

  const reg = await db.walkInRegistration.findUnique({
    where: { id: regId },
    select: {
      viblockToken: true,
      participantId: true,
      contingentId: true,
      participant: {
        select: {
          name: true,
          contingent: {
            select: {
              name: true,
              state: { select: { name: true } },
            },
          },
        },
      },
      contingent: { select: { name: true } },
    },
  });
  if (!reg) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!reg.viblockToken) return NextResponse.json({ error: "NO_TOKEN" }, { status: 400 });

  const parsed = parseDroneToken(reg.viblockToken);
  if (!parsed) return NextResponse.json({ error: "INVALID_TOKEN_FORMAT" }, { status: 422 });

  try {
    let accessToken: string;

    // Track which userid/password are actually active (may change during re-registration)
    let activeUserid = parsed.userid;
    let activePassword = parsed.password;

    try {
      accessToken = await droneRefreshToken(activeUserid, activePassword);
    } catch (e) {
      // If user no longer exists on eptim-drone (401/404/403), re-register them
      const status = (e as { status?: number }).status;
      if (status === 401 || status === 404 || status === 403) {
        const sectorCustomId = (reg.contingentId ?? "").slice(-16);
        const result = await droneRegisterParticipant({
          sectorName:     reg.participant.contingent?.name ?? reg.contingent.name,
          sectorRegion:   reg.participant.contingent?.state?.name ?? "",
          sectorCustomId,
          userid:         activeUserid,
          fullName:       reg.participant.name,
        });
        accessToken = result.accessToken;
        activeUserid = result.userid;
        activePassword = result.password;
      } else {
        throw e;
      }
    }

    // Regenerate competition token (or get one if none stored)
    let competitionToken = parsed.competitionToken;
    let endpointId = parsed.endpointId;

    if (endpointId) {
      try {
        const tokenData = await droneRegenerateCompetitionToken(endpointId, activeUserid);
        competitionToken = tokenData.token;
      } catch {
        // Keep existing token if regeneration fails
      }
    } else {
      // No endpoint stored — try to find one and create a token
      try {
        const { endpoints } = await droneListEndpoints();
        const activeEndpoint = endpoints.find(ep => ep.is_active);
        if (activeEndpoint) {
          const tokenData = await droneGetOrCreateCompetitionToken(activeEndpoint.id, activeUserid);
          competitionToken = tokenData.token;
          endpointId = activeEndpoint.id;
        }
      } catch {
        // Competition token is optional
      }
    }

    const stored = encodeDroneToken(
      activeUserid,
      activePassword,
      accessToken,
      competitionToken ?? undefined,
      endpointId ?? undefined,
    );
    await db.walkInRegistration.update({
      where: { id: regId },
      data: { viblockToken: stored },
    });
    return NextResponse.json({
      userid: activeUserid,
      password: activePassword,
      accessToken,
      competitionToken,
      endpointId,
    });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json(
      { error: err.message ?? "Token refresh failed" },
      { status: err.status ?? 502 },
    );
  }
}
