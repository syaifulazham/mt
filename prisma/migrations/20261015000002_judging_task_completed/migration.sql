-- A judge announcing their task complete from the judging page locks that
-- task; once every ACTIVE task of the competition is complete the
-- competition's judgingStatus moves to COMPLETED. Existing tasks stay open.
ALTER TABLE "judging_tasks" ADD COLUMN "completedAt" TIMESTAMP(3);
