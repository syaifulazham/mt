-- Asia Spark Quizzly participant registration + issued login tokens.
--
-- Quizzly exposes no lookup by personal_id, so registration state is recorded
-- locally; `quizzlyParticipantId` is the UUID it assigns.
CREATE TABLE "participant_quizzly_access" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "quizzlyParticipantId" TEXT NOT NULL,
    "personalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "participant_quizzly_access_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "participant_quizzly_tokens" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "eventCompetitionId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "quizTitle" TEXT,
    "tokenId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "startUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "participant_quizzly_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "participant_quizzly_access_participantId_key" ON "participant_quizzly_access"("participantId");
CREATE UNIQUE INDEX "participant_quizzly_tokens_participantId_eventCompetitionId_key" ON "participant_quizzly_tokens"("participantId", "eventCompetitionId");
CREATE INDEX "participant_quizzly_tokens_participantId_idx" ON "participant_quizzly_tokens"("participantId");

ALTER TABLE "participant_quizzly_access" ADD CONSTRAINT "participant_quizzly_access_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "contestants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "participant_quizzly_tokens" ADD CONSTRAINT "participant_quizzly_tokens_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "contestants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
