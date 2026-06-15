-- Add event-specific EptimEdu course fields to EventCompetition
-- These are independent of the general Competition.eptimEduCourseId
ALTER TABLE "event_competitions" ADD COLUMN "eptimEduCourseId" TEXT;
ALTER TABLE "event_competitions" ADD COLUMN "eptimEduCourseTitle" TEXT;
