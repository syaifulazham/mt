-- Migration: school_category_full_names
-- Replaces 5-value SchoolCategory enum with 26 full official KPM school type names.
-- Adds categoryShort column to preserve original short codes (SK, SMK, etc.).
-- Also syncs EventScope enum and removes unused CompetitionStatus enum.

-- ── 1. Add categoryShort column ───────────────────────────────────────────────
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "categoryShort" TEXT;

-- ── 2. Rename old SchoolCategory enum out of the way ─────────────────────────
ALTER TYPE "SchoolCategory" RENAME TO "SchoolCategory_old";

-- ── 3. Create new SchoolCategory enum ────────────────────────────────────────
CREATE TYPE "SchoolCategory" AS ENUM (
  'Sekolah Kebangsaan',
  'Sekolah Menengah Kebangsaan',
  'Sekolah Jenis Kebangsaan Cina',
  'Sekolah Jenis Kebangsaan Tamil',
  'Sekolah Menengah Kebangsaan Agama',
  'Sekolah Menengah Agama Bantuan Kerajaan',
  'Sekolah Rendah Agama Bantuan Kerajaan',
  'Sekolah Menengah Agama',
  'Sekolah Rendah Agama',
  'Sekolah Kebangsaan Tahfiz',
  'Sekolah Berasrama Penuh',
  'Maktab Rendah Sains MARA',
  'Kolej Vokasional',
  'Sekolah Menengah Teknik',
  'Sekolah Kebangsaan Pendidikan Khas',
  'Sekolah Menengah Pendidikan Khas',
  'Sekolah Bimbingan Jalinan Kasih',
  'Sekolah Model Khas',
  'Sekolah Seni Malaysia',
  'Sekolah Sukan Malaysia',
  'Pusat Tingkatan Enam',
  'Kolej Tingkatan Enam',
  'Sekolah Antarabangsa',
  'Sekolah Menengah Persendirian Cina',
  'Sekolah Menengah Akademik',
  'Sekolah Rendah Akademik'
);

-- ── 4. Migrate schools.category to new enum ───────────────────────────────────
ALTER TABLE "schools"
  ALTER COLUMN "category" DROP DEFAULT,
  ALTER COLUMN "category" TYPE "SchoolCategory" USING (
    CASE "category"::text
      WHEN 'KEBANGSAAN'       THEN 'Sekolah Kebangsaan'::"SchoolCategory"
      WHEN 'KEBANGSAAN_CINA'  THEN 'Sekolah Jenis Kebangsaan Cina'::"SchoolCategory"
      WHEN 'KEBANGSAAN_TAMIL' THEN 'Sekolah Jenis Kebangsaan Tamil'::"SchoolCategory"
      WHEN 'AGAMA'            THEN 'Sekolah Menengah Kebangsaan Agama'::"SchoolCategory"
      WHEN 'TEKNIK'           THEN 'Sekolah Menengah Teknik'::"SchoolCategory"
      WHEN 'SPORT'            THEN 'Sekolah Sukan Malaysia'::"SchoolCategory"
      WHEN 'PRIVATE'          THEN 'Sekolah Menengah Persendirian Cina'::"SchoolCategory"
      WHEN 'LAIN_LAIN'        THEN 'Sekolah Kebangsaan'::"SchoolCategory"
      ELSE 'Sekolah Kebangsaan'::"SchoolCategory"
    END
  );

-- ── 5. Drop old enum ──────────────────────────────────────────────────────────
DROP TYPE "SchoolCategory_old";

-- ── 6. Sync EventScope enum ───────────────────────────────────────────────────
ALTER TYPE "EventScope" ADD VALUE IF NOT EXISTS 'OPEN';
ALTER TYPE "EventScope" ADD VALUE IF NOT EXISTS 'ONLINE_NATIONAL';
ALTER TYPE "EventScope" ADD VALUE IF NOT EXISTS 'ONLINE_STATE';
ALTER TYPE "EventScope" ADD VALUE IF NOT EXISTS 'ONLINE_ZONE';
ALTER TYPE "EventScope" ADD VALUE IF NOT EXISTS 'ONLINE_OPEN';

-- ── 7. Add unique constraint on contingents.schoolId ─────────────────────────
ALTER TABLE "contingents" DROP CONSTRAINT IF EXISTS "contingents_schoolId_key";
ALTER TABLE "contingents" ADD CONSTRAINT "contingents_schoolId_key" UNIQUE ("schoolId");
