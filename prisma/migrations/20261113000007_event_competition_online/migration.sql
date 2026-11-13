-- Competitions run online within a physical event (hand-scoped).
ALTER TABLE "event_competitions" ADD COLUMN "isOnline" BOOLEAN NOT NULL DEFAULT false;
