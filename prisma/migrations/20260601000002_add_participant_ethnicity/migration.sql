-- CreateEnum
CREATE TYPE "Ethnicity" AS ENUM ('MELAYU', 'CINA', 'INDIA', 'ORANG_ASLI_SEMENANJUNG', 'BUMIPUTRA_SABAH', 'BUMIPUTRA_SARAWAK', 'LAIN_LAIN');

-- AlterTable
ALTER TABLE "contestants" ADD COLUMN "ethnicity" "Ethnicity";
