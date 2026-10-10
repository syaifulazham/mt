// Eptim FC-1 — the Viblock Arena external API (see VIBLOCK-ARENA-API-GUIDELINE.md).
//
// Every request is scoped to ONE Viblock event by its API key, so "the FC-1
// event" is whichever event EPTIMFC1_API_KEY was issued for — there is no event
// id in the URL. This is a separate key from the walk-in Viblock integration in
// viblock.ts (WALKIN_EPTIM_VIBLOCK_*), which points at a different event.
//
// The implementation is the shared arena client (arena-client.ts), which Eptim
// Drone uses too; the names below are kept for the FC-1 call sites.
import {
  createArenaClient,
  type ArenaAttempts, type ArenaChallenge, type ArenaLaunchStatus, type ArenaRegistration,
} from "@/lib/arena-client";

export const fc1 = createArenaClient({
  label:   "Eptim FC-1",
  baseUrl: process.env.EPTIMFC1_BASE_URL ?? "",
  apiKey:  process.env.EPTIMFC1_API_KEY ?? "",
  appUrl:  process.env.EPTIMFC1_APP_URL ?? "",
  env:     { baseUrl: "EPTIMFC1_BASE_URL", apiKey: "EPTIMFC1_API_KEY", appUrl: "EPTIMFC1_APP_URL" },
});

export type Fc1Challenge     = ArenaChallenge;
export type Fc1Registration  = ArenaRegistration;
export type Fc1LaunchStatus  = ArenaLaunchStatus;
export type Fc1Attempts      = ArenaAttempts;

export const fc1Configured        = fc1.configured;
export const fc1ListChallenges    = fc1.listChallenges;
export const fc1CheckUser         = fc1.checkUser;
export const fc1CreateUser        = fc1.createUser;
export const fc1CheckSector       = fc1.checkSector;
export const fc1CreateSector      = fc1.createSector;
export const fc1AssignMember      = fc1.assignMember;
export const fc1LaunchUrl         = fc1.launchUrl;
export const fc1RehostLaunchUrl   = fc1.rehostLaunchUrl;
export const fc1LaunchStatus      = fc1.launchStatus;
export const fc1Attempts          = fc1.attempts;
export const fc1RegisterChallenge = fc1.registerChallenge;
export const fc1UserRegistrations = fc1.userRegistrations;
export const fc1ErrorMessage      = fc1.errorMessage;
