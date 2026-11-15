-- Competition exempt from the event's single-participation rule.
ALTER TABLE "event_competitions" ADD COLUMN "soloExempt" BOOLEAN NOT NULL DEFAULT false;
