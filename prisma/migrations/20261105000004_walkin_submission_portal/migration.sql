-- Walk-in team entries can also be submitted from the participant portal
-- dashboard, which has no public borang endpoint. Hand-scoped.
ALTER TABLE "walkin_form_submissions" ALTER COLUMN "endpointId" DROP NOT NULL;
