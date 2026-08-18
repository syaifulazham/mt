ALTER TABLE "event_walkin_competitions" ADD COLUMN IF NOT EXISTS "vibeBlocksChallengeId" TEXT;
ALTER TABLE "event_walkin_competitions" ADD COLUMN IF NOT EXISTS "vibeBlocksEventName" TEXT;
ALTER TABLE "event_walkin_competitions" ADD COLUMN IF NOT EXISTS "vibeBlocksStartsAt" TIMESTAMP(3);
ALTER TABLE "event_walkin_competitions" ADD COLUMN IF NOT EXISTS "vibeBlocksEndsAt" TIMESTAMP(3);
ALTER TABLE "event_walkin_competitions" ADD COLUMN IF NOT EXISTS "vibeBlocksRunDurationSec" INTEGER;
