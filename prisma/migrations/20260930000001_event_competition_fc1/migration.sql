-- Eptim FC-1 (Viblock Arena) challenge selection per event-competition.
--
-- `fc1EventId` records which Viblock event the challenges were picked from.
-- The API key determines the event, so if EPTIMFC1_API_KEY is ever re-issued
-- for a different event the stored picks can be recognised as stale.
ALTER TABLE "event_competitions" ADD COLUMN     "fc1EventId" TEXT,
                                ADD COLUMN     "fc1Challenges" JSONB;
