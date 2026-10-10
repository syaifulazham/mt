import type { QuizzlyAttemptProgress, QuizzlyTokenState } from "@/lib/asiaspark-quizzly";

/**
 * One participant's Asia Spark state in one event-competition, as served by
 * GET /api/v2/manager/individuals/quizzly-progress. Types only, so the
 * Individuals page's client island can share it with the route.
 */
export type QuizzlyCell =
  | { state: "no_account" }   // never registered with Quizzly
  | { state: "no_token" }     // registered, no code issued for this competition
  | { state: "unknown" }      // Quizzly could not be reached for this session
  | {
      state: "ok";
      tokensIssued: number;
      currentStatus: QuizzlyTokenState;
      progress: QuizzlyAttemptProgress;
      answered: number;
      totalQuestions: number;
      quizTitle: string;
    };
