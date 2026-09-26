-- "Penyertaan" setting per event. Defaults to false ("Penyertaan Tunggal Sahaja"),
-- which is the rule the manager join-event and add-member routes already enforce,
-- so every existing event keeps its current behaviour.
ALTER TABLE "events" ADD COLUMN "allowMultipleParticipation" BOOLEAN NOT NULL DEFAULT false;
