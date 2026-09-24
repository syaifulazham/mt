-- The CSI competition/case mapping belongs to the event–competition pairing,
-- next to eptimEduCourseId, not to the competition as a whole.

-- AlterTable
ALTER TABLE "event_competitions"
    ADD COLUMN "eptimCsiCompetitionId"   TEXT,
    ADD COLUMN "eptimCsiCompetitionName" TEXT,
    ADD COLUMN "eptimCsiCases"           JSONB;

-- Carry over anything already configured at competition level to every event
-- that competition is linked to.
UPDATE "event_competitions" ec
SET "eptimCsiCompetitionId"   = c."eptimCsiCompetitionId",
    "eptimCsiCompetitionName" = c."eptimCsiCompetitionName",
    "eptimCsiCases"           = c."eptimCsiCases"
FROM "competitions" c
WHERE c."id" = ec."competitionId"
  AND c."eptimCsiCompetitionId" IS NOT NULL;

-- AlterTable
ALTER TABLE "competitions"
    DROP COLUMN "eptimCsiCompetitionId",
    DROP COLUMN "eptimCsiCompetitionName",
    DROP COLUMN "eptimCsiCases";
