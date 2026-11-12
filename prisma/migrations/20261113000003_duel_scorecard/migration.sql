-- Duel scorecard marks per entry (hand-scoped).
ALTER TABLE "duel_entries" ADD COLUMN "tally" JSONB;
ALTER TABLE "duel_entries" ADD COLUMN "score" DOUBLE PRECISION;
