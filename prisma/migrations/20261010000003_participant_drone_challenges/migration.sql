-- Eptim Drone challenge registrations for INDIVIDUAL Drone competitions, per
-- participant, with the latest single-use launch link. Counterpart of
-- participant_fc1_challenges; team Drone competitions use team_drone_challenges.
CREATE TABLE "participant_drone_challenges" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "eventCompetitionId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "challengeName" TEXT NOT NULL,
    "droneSyncedAt" TIMESTAMP(3),
    "launchCode" TEXT,
    "launchUrl" TEXT,
    "launchExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_drone_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "participant_drone_challenges_participantId_eventCompetitionId_challengeId_key" ON "participant_drone_challenges"("participantId", "eventCompetitionId", "challengeId");
CREATE INDEX "participant_drone_challenges_participantId_idx" ON "participant_drone_challenges"("participantId");
CREATE INDEX "participant_drone_challenges_challengeId_idx" ON "participant_drone_challenges"("challengeId");

ALTER TABLE "participant_drone_challenges" ADD CONSTRAINT "participant_drone_challenges_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "contestants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
