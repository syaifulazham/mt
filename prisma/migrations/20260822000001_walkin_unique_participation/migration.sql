-- AlterTable
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "walkInUniqueParticipation" BOOLEAN NOT NULL DEFAULT false;
