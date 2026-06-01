-- CreateEnum
CREATE TYPE "Locality" AS ENUM ('BANDAR', 'SUB_BANDAR', 'LUAR_BANDAR');

-- AlterTable
ALTER TABLE "contingents" ADD COLUMN "locality" "Locality";
