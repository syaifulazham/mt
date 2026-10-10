-- Eptim Drone challenge selection per event-competition, mirroring the FC-1
-- columns. "droneEventId" records which Drone event the picks came from, since
-- EPTIMDRONE_API_KEY decides the event and a re-issued key would make them stale.
ALTER TABLE "event_competitions" ADD COLUMN     "droneEventId" TEXT,
                                ADD COLUMN     "droneChallenges" JSONB;
