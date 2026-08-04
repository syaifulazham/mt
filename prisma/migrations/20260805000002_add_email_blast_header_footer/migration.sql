ALTER TABLE "email_blasts" ADD COLUMN "includeHeader" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "email_blasts" ADD COLUMN "includeFooter" BOOLEAN NOT NULL DEFAULT true;
