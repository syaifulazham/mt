-- The announcement marks become the announcement list's entries: a Super Admin
-- orders the list (sortOrder) and gives each result a green light before the
-- MC announces it. A row can now exist before it is announced, so announcedAt
-- is nullable (existing rows keep their announcement time).
ALTER TABLE "announcement_marks"
  ADD COLUMN "sortOrder"  INTEGER,
  ADD COLUMN "greenLight" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "greenLitAt" TIMESTAMP(3),
  ADD COLUMN "greenLitBy" TEXT,
  ALTER COLUMN "announcedAt" DROP NOT NULL,
  ALTER COLUMN "announcedAt" DROP DEFAULT;
