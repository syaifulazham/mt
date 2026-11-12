-- Duel group league before the knockout (hand-scoped).
ALTER TABLE "duel_rounds" ADD COLUMN "stage" TEXT NOT NULL DEFAULT 'ROUND';
ALTER TABLE "duel_sessions" ADD COLUMN "pool" TEXT;
