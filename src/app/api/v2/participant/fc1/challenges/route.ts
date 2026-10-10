import { FC1_INDIVIDUAL, individualRegisterHandler } from "@/lib/individualArena";

// POST { eventCompetitionId, challengeId } — register for one FC-1 challenge and
// get a launch link. Shared with individual Eptim Drone; see individualArena.ts.
export const POST = individualRegisterHandler(FC1_INDIVIDUAL);
