-- Per event competition, on the participant portal: PUBLIC (open to every eligible
-- participant, who may register themselves) or RESTRICTED (only participants
-- already registered in it; no self-registration). Default PUBLIC = today's behaviour.
ALTER TABLE "event_competitions" ADD COLUMN "portalAccess" TEXT NOT NULL DEFAULT 'PUBLIC';
