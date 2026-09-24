-- AlterTable
ALTER TABLE "competitions"
    ADD COLUMN "eptimCsiCompetitionId"   TEXT,
    ADD COLUMN "eptimCsiCompetitionName" TEXT,
    ADD COLUMN "eptimCsiCases"           JSONB;
