-- Eptim FC-1 participant accounts and per-challenge registrations.
--
-- FC-1 has no challenge-registration endpoint yet (see
-- FC1-CHALLENGE-REGISTRATION-API-PROMPT.md), so registrations are recorded here
-- first; "fc1SyncedAt" is null until a row has been pushed upstream.
CREATE TABLE "participant_fc1_access" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "fc1UserId" TEXT NOT NULL,
    "fc1Password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_fc1_access_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "participant_fc1_challenges" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "eventCompetitionId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "challengeName" TEXT NOT NULL,
    "fc1SyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_fc1_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "participant_fc1_access_participantId_key" ON "participant_fc1_access"("participantId");
CREATE UNIQUE INDEX "participant_fc1_challenges_participantId_eventCompetitionId_challengeId_key" ON "participant_fc1_challenges"("participantId", "eventCompetitionId", "challengeId");
CREATE INDEX "participant_fc1_challenges_participantId_idx" ON "participant_fc1_challenges"("participantId");
CREATE INDEX "participant_fc1_challenges_challengeId_idx" ON "participant_fc1_challenges"("challengeId");

ALTER TABLE "participant_fc1_access" ADD CONSTRAINT "participant_fc1_access_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "contestants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "participant_fc1_challenges" ADD CONSTRAINT "participant_fc1_challenges_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "contestants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
