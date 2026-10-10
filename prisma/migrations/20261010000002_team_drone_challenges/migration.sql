-- Eptim Drone challenge registrations, per team (Drone players are team
-- accounts), with the latest single-use launch link. Team counterpart of
-- participant_fc1_challenges.
CREATE TABLE "team_drone_challenges" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "eventCompetitionId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "challengeName" TEXT NOT NULL,
    "droneSyncedAt" TIMESTAMP(3),
    "launchCode" TEXT,
    "launchUrl" TEXT,
    "launchExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_drone_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "team_drone_challenges_teamId_eventCompetitionId_challengeId_key" ON "team_drone_challenges"("teamId", "eventCompetitionId", "challengeId");
CREATE INDEX "team_drone_challenges_teamId_idx" ON "team_drone_challenges"("teamId");
CREATE INDEX "team_drone_challenges_challengeId_idx" ON "team_drone_challenges"("challengeId");

ALTER TABLE "team_drone_challenges" ADD CONSTRAINT "team_drone_challenges_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
