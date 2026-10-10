import { FC1_INDIVIDUAL, individualLinkHandler } from "@/lib/individualArena";

// POST { eventCompetitionId, challengeId } — reuse or renew the FC-1 launch link.
export const POST = individualLinkHandler(FC1_INDIVIDUAL);
