-- VibeBlocks Partner API 1.8: events carry a school level (primary / secondary).
ALTER TABLE "event_walkin_competitions" ADD COLUMN IF NOT EXISTS "vibeBlocksSchoolLevel" TEXT;
