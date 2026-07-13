-- Add needManagerAcceptance flag to events
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "needManagerAcceptance" BOOLEAN NOT NULL DEFAULT false;

-- Add acceptance status to team_events (PENDING | HOLD | ACCEPT | REJECT)
ALTER TABLE "team_events" ADD COLUMN IF NOT EXISTS "acceptance" TEXT NOT NULL DEFAULT 'PENDING';
