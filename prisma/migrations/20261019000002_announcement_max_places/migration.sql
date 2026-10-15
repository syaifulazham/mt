-- Announcement configuration: how many places the MC boards announce per
-- result (5 = ranks 1 to 5). Existing events default to the top 3.
ALTER TABLE "events" ADD COLUMN "announcementMaxPlaces" INTEGER NOT NULL DEFAULT 3;
