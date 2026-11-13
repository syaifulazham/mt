-- Free-text recipients for hand-picked special award winners (hand-scoped).
ALTER TABLE "special_award_winners" ADD COLUMN "customName" TEXT;
ALTER TABLE "special_award_winners" ADD COLUMN "customNote" TEXT;
