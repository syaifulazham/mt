-- Marks teams an administrator added to an event as a wildcard — i.e. outside
-- the event's state/zone eligibility — so they can be told apart in the lists.
ALTER TABLE "team_events" ADD COLUMN "wildcard" BOOLEAN NOT NULL DEFAULT false;
