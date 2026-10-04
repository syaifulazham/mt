-- Latest FC-1 launch link per challenge registration (single-use, 5 minutes),
-- so the dashboard can show it and check its status with FC-1.
ALTER TABLE "participant_fc1_challenges" ADD COLUMN "launchCode" TEXT,
                                         ADD COLUMN "launchUrl" TEXT,
                                         ADD COLUMN "launchExpiresAt" TIMESTAMP(3);
