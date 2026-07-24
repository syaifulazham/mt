-- CreateTable
CREATE TABLE IF NOT EXISTS "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- Drop locked columns added in previous session (unused)
ALTER TABLE "states" DROP COLUMN IF EXISTS "locked";
ALTER TABLE "target_groups" DROP COLUMN IF EXISTS "locked";
ALTER TABLE "themes" DROP COLUMN IF EXISTS "locked";
ALTER TABLE "zones" DROP COLUMN IF EXISTS "locked";
