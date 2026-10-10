import { DRONE_INDIVIDUAL, individualLinkHandler } from "@/lib/individualArena";

// POST { eventCompetitionId, challengeId } — reuse or renew the individual Drone launch link.
export const POST = individualLinkHandler(DRONE_INDIVIDUAL);
