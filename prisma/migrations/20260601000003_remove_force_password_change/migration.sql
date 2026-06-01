-- Remove forced password change: change default to false and clear existing flags
ALTER TABLE "organizer_users" ALTER COLUMN "forcePasswordChange" SET DEFAULT false;
UPDATE "organizer_users" SET "forcePasswordChange" = false WHERE "forcePasswordChange" = true;
