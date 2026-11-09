-- AlterTable
ALTER TABLE "event_competitions" ADD COLUMN "resultScope" TEXT,
ADD COLUMN "configLockedAt" TIMESTAMP(3),
ADD COLUMN "configLockedBy" TEXT;
