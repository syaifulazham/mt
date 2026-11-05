-- Game platform for the walk-in partner integration (VibeBlocks or TechTriathlon).
ALTER TABLE "event_walkin_competitions"
  ADD COLUMN "vibeBlocksProvider" TEXT NOT NULL DEFAULT 'vibeblocks';
