-- A live scoreboard link may show another VibeBlocks event (partner event_id) instead of its competition's own.
ALTER TABLE "walkin_scoreboard_endpoints" ADD COLUMN "vibeBlocksEventId" TEXT;
