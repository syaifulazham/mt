-- Competition setting: include in the dashboard's initial participation stats.
-- Existing competitions stay included.
ALTER TABLE "competitions" ADD COLUMN "includeInDashboardStats" BOOLEAN NOT NULL DEFAULT true;
