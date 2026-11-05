-- Walk-in team entries: the borang carries a temporary team (name + members),
-- which the organizer verifies into a main-data team. One walk-in registration
-- per team. Hand-scoped to these columns only (see AGENTS.md).
ALTER TABLE "walkin_form_submissions" ADD COLUMN "teamName" TEXT;
ALTER TABLE "walkin_form_submissions" ADD COLUMN "teamMembers" JSONB;
ALTER TABLE "walkin_form_submissions" ADD COLUMN "teamId" TEXT;
ALTER TABLE "walkin_registrations" ADD COLUMN "teamId" TEXT;

CREATE INDEX "walkin_registrations_teamId_idx" ON "walkin_registrations"("teamId");

ALTER TABLE "walkin_form_submissions" ADD CONSTRAINT "walkin_form_submissions_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "walkin_registrations" ADD CONSTRAINT "walkin_registrations_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
