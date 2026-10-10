import { DRONE_INDIVIDUAL, individualRegisterHandler } from "@/lib/individualArena";

// POST { eventCompetitionId, challengeId } — register for one challenge of an
// INDIVIDUAL Eptim Drone competition and get a launch link. Same flow as FC-1;
// team Drone competitions use /participant/drone/challenges.
export const POST = individualRegisterHandler(DRONE_INDIVIDUAL);
