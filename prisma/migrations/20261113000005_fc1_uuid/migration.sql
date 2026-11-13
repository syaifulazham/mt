-- FC-1's internal player id, used instead of the synthetic userid (hand-scoped).
ALTER TABLE "participant_fc1_access" ADD COLUMN "fc1Uuid" TEXT;
