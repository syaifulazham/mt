-- Walk-in judging gets the same lifecycle as regular judging:
-- OPEN → COMPLETED (forms locked) → VERIFIED (Super Admin), plus judges
-- announcing their own endpoint complete. Existing rows stay OPEN / open.
ALTER TABLE "event_walkin_competitions"
  ADD COLUMN "judgingStatus"      TEXT NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "judgingCompletedAt" TIMESTAMP(3),
  ADD COLUMN "judgingCompletedBy" TEXT,
  ADD COLUMN "judgingVerifiedAt"  TIMESTAMP(3),
  ADD COLUMN "judgingVerifiedBy"  TEXT;

ALTER TABLE "walkin_judging_endpoints" ADD COLUMN "completedAt" TIMESTAMP(3);
