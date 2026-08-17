import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { viblockCompetitionRegister, viblockConfigured } from "@/lib/viblock";
import {
  vibeBlocksConfigured, vibeBlocksRegisterEntry,
  generateEntryToken, encodeVibeBlocksToken, parseVibeBlocksToken,
} from "@/lib/vibeblocks";
import {
  droneConfigured, droneRegisterParticipant, encodeDroneToken, parseDroneToken,
  droneListEndpoints, droneGetOrCreateCompetitionToken, deriveDroneUserId,
} from "@/lib/drone";

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
      id: true, walkInCompetitionId: true, participantId: true, contingentId: true, status: true, confirmedAt: true, viblockToken: true,
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
          useVibeblocks: true,
          useDronearena: true,
          viblockChallengeId: true,
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
  let vibeBlocksToken: string | null = null; // entry_token shown to participant on confirm
  let droneToken: { userid: string; password: string; accessToken: string; competitionToken?: string | null } | null = null;

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
    } else if (!viblockToken && reg.walkInCompetition?.useVibeblocks && vibeBlocksConfigured() && reg.walkInCompetition.viblockChallengeId) {
      try {
        const entryToken = generateEntryToken();
        const vRes = await vibeBlocksRegisterEntry(reg.walkInCompetition.viblockChallengeId, {
          entryToken,
          partnerReference: registrationId,
        });
        viblockToken = encodeVibeBlocksToken(entryToken, vRes.entry_id);
        vibeBlocksToken = entryToken;
      } catch (e) {
        console.error("[vibeblocks] register entry on confirm failed:", e);
      }
    } else if (!viblockToken && reg.walkInCompetition?.useDronearena && droneConfigured()) {
      try {
        const sectorCustomId = (reg.contingentId ?? "").slice(-16);
        const droneUserId = deriveDroneUserId(reg.participantId);
        const result = await droneRegisterParticipant({
          sectorName:     reg.participant.contingent?.name ?? reg.contingent.name,
          sectorRegion:   reg.participant.contingent?.state?.name ?? "",
          sectorCustomId,
          userid:         droneUserId,
          fullName:       reg.participant.name,
        });
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
        } catch (e) {
          console.error("[drone] competition token on confirm failed:", e);
        }
        viblockToken = encodeDroneToken(result.userid, result.password, result.accessToken, competitionToken ?? undefined, endpointId ?? undefined);
        droneToken = { ...result, competitionToken };
      } catch (e) {
        console.error("[drone] register on confirm failed:", e);
      }
    }

    await db.walkInRegistration.update({
      where: { id: registrationId },
      data: { status: "CONFIRMED", confirmedAt: new Date(), viblockToken },
    });
  } else if (viblockToken && reg.walkInCompetition?.useVibeblocks) {
    // Already confirmed — parse stored composite to surface the entry_token for display
    const parsed = parseVibeBlocksToken(viblockToken);
    if (parsed) vibeBlocksToken = parsed.entryToken;
  } else if (viblockToken && reg.walkInCompetition?.useDronearena) {
    // Already confirmed — parse stored composite drone token for display
    const parsed = parseDroneToken(viblockToken);
    if (parsed) droneToken = { userid: parsed.userid, password: parsed.password, accessToken: parsed.accessToken, competitionToken: parsed.competitionToken };
  }

  return NextResponse.json({
    data: {
      id:             reg.id,
      alreadyConfirmed,
      viblockToken:     reg.walkInCompetition?.useViblockarena ? viblockToken : undefined,
      vibeBlocksToken:  reg.walkInCompetition?.useVibeblocks  ? vibeBlocksToken : undefined,
      droneToken:       reg.walkInCompetition?.useDronearena   ? droneToken : undefined,
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
