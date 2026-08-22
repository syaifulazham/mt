import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { viblockCompetitionRegister, viblockConfigured } from "@/lib/viblock";
import {
  vibeBlocksConfigured, vibeBlocksRegisterEntry,
  generateEntryToken, encodeVibeBlocksToken,
} from "@/lib/vibeblocks";
import {
  droneConfigured, droneRegisterParticipant, encodeDroneToken,
  droneListEndpoints, droneGetOrCreateCompetitionToken, deriveDroneUserId,
} from "@/lib/drone";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { participantId, passcode, registeredBy, competitionId } = await req.json();

  if (!participantId) return NextResponse.json({ error: "MISSING_PARTICIPANT" }, { status: 400 });

  const endpoint = await db.walkInEndpoint.findUnique({
    where: { routeSlug: slug },
    select: { id: true, passcode: true, active: true, walkInCompetitionId: true, eventId: true, event: { select: { walkInUniqueParticipation: true } } },
  });

  if (!endpoint || !endpoint.active)
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!endpoint.passcode || endpoint.passcode !== passcode)
    return NextResponse.json({ error: "INVALID_PASSCODE" }, { status: 403 });

  // Resolve WIC id: specific endpoint uses its own; general uses competitionId from body
  const wicId = endpoint.walkInCompetitionId ?? competitionId;
  if (!wicId) return NextResponse.json({ error: "MISSING_COMPETITION" }, { status: 400 });

  const wic = await db.eventWalkInCompetition.findUnique({
    where: { id: wicId, eventId: endpoint.eventId },
    select: { id: true, maxSlots: true, useViblockarena: true, useVibeblocks: true, useDronearena: true, viblockChallengeId: true, _count: { select: { registrations: true } } },
  });
  if (!wic) return NextResponse.json({ error: "COMPETITION_NOT_FOUND" }, { status: 404 });
  if (wic.maxSlots > 0 && wic._count.registrations >= wic.maxSlots)
    return NextResponse.json({ error: "SLOTS_FULL" }, { status: 409 });

  // Penyertaan Unik: one active walk-in registration per participant per event
  if (endpoint.event.walkInUniqueParticipation) {
    const existing = await db.walkInRegistration.findFirst({
      where: {
        participantId,
        status: { in: ["PENDING", "CONFIRMED"] },
        walkInCompetition: { eventId: endpoint.eventId },
      },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ error: "UNIQUE_PARTICIPATION" }, { status: 409 });
  }

  const participant = await db.participant.findUnique({
    where: { id: participantId },
    select: {
      id: true, name: true, contingentId: true,
      contingent: {
        select: {
          name: true,
          state: { select: { name: true } },
        },
      },
    },
  });
  if (!participant) return NextResponse.json({ error: "PARTICIPANT_NOT_FOUND" }, { status: 404 });

  // Register to Viblock Arena if configured and enabled
  let viblockToken: string | null = null;
  let vibeBlocksToken: string | null = null; // entry_token shown to participant
  let droneToken: { userid: string; password: string; accessToken: string; competitionToken?: string | null } | null = null;
  if (wic.useViblockarena && viblockConfigured()) {
    try {
      const vRes = await viblockCompetitionRegister({
        sector: participant.contingent?.name ?? "",
        region: participant.contingent?.state?.name ?? "",
        name:   participant.name,
      });
      viblockToken = vRes.token;
    } catch (e) {
      console.error("[viblock] competition register failed:", e);
    }
  } else if (wic.useVibeblocks && vibeBlocksConfigured() && wic.viblockChallengeId) {
    try {
      const entryToken = generateEntryToken();
      const vRes = await vibeBlocksRegisterEntry(wic.viblockChallengeId, {
        entryToken,
        partnerReference: undefined, // reg id not yet known; organizer can set it later
      });
      viblockToken = encodeVibeBlocksToken(entryToken, vRes.entry_id);
      vibeBlocksToken = entryToken;
    } catch (e) {
      console.error("[vibeblocks] register entry failed:", e);
    }
  } else if (wic.useDronearena && droneConfigured()) {
    try {
      const sectorCustomId = (participant.contingentId ?? "").slice(-16);
      const droneUserId = deriveDroneUserId(participantId);
      const result = await droneRegisterParticipant({
        sectorName:     participant.contingent?.name ?? "Unknown",
        sectorRegion:   participant.contingent?.state?.name ?? "",
        sectorCustomId,
        userid:         droneUserId,
        fullName:       participant.name,
      });
      // Try to generate a competition terminal token for the correct challenge endpoint
      let competitionToken: string | null = null;
      let endpointId: string | null = null;
      try {
        const challengeId = wic.viblockChallengeId;
        const { endpoints } = await droneListEndpoints();
        const activeEndpoint =
          (challengeId ? endpoints.find(ep => ep.is_active && ep.challenge_id === challengeId) : undefined)
          ?? endpoints.find(ep => ep.is_active);
        if (activeEndpoint) {
          const tokenData = await droneGetOrCreateCompetitionToken(activeEndpoint.id, droneUserId);
          competitionToken = tokenData.token;
          endpointId = activeEndpoint.id;
        }
      } catch (e) {
        console.error("[drone] competition token failed:", e);
      }
      viblockToken = encodeDroneToken(result.userid, result.password, result.accessToken, competitionToken ?? undefined, endpointId ?? undefined);
      droneToken = { ...result, competitionToken };
    } catch (e) {
      console.error("[drone] register failed:", e);
    }
  }

  try {
    const reg = await db.walkInRegistration.create({
      data: {
        walkInCompetitionId: wic.id,
        participantId,
        contingentId: participant.contingentId,
        status:       "CONFIRMED",
        method:       "COUNTER",
        registeredBy: registeredBy?.trim() || null,
        confirmedAt:  new Date(),
        viblockToken,
      },
      select: { id: true, status: true },
    });
    return NextResponse.json({ data: { ...reg, viblockToken, vibeBlocksToken, droneToken } }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "ALREADY_REGISTERED" }, { status: 409 });
    throw e;
  }
}
