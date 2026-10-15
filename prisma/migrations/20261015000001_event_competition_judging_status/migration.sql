-- Judging lifecycle per event-competition: OPEN → COMPLETED (judging announced
-- complete, judge forms locked) → VERIFIED (results confirmed by a Super Admin).
-- Existing rows stay OPEN, so nothing currently being judged gets locked.
ALTER TABLE "event_competitions"
  ADD COLUMN "judgingStatus"      TEXT NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "judgingCompletedAt" TIMESTAMP(3),
  ADD COLUMN "judgingCompletedBy" TEXT,
  ADD COLUMN "judgingVerifiedAt"  TIMESTAMP(3),
  ADD COLUMN "judgingVerifiedBy"  TEXT;
