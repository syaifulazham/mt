/*
  Warnings:

  - Added the required column `updatedAt` to the `events` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EventScope" AS ENUM ('NATIONAL', 'STATE', 'ZONE', 'DISTRICT');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ParticipationType" AS ENUM ('INDIVIDUAL', 'TEAM');

-- CreateEnum
CREATE TYPE "JudgingType" AS ENUM ('PERCENTAGE', 'SCORE');

-- CreateEnum
CREATE TYPE "CompetitionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'REG_OPEN', 'REG_CLOSED', 'ONGOING', 'COMPLETED');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "address" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "registrationEnd" TIMESTAMP(3),
ADD COLUMN     "registrationStart" TIMESTAMP(3),
ADD COLUMN     "scope" "EventScope" NOT NULL DEFAULT 'NATIONAL',
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "venue" TEXT;

-- CreateTable
CREATE TABLE "competitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "eventId" TEXT NOT NULL,
    "themeId" TEXT,
    "participationType" "ParticipationType" NOT NULL DEFAULT 'INDIVIDUAL',
    "minTeamSize" INTEGER NOT NULL DEFAULT 1,
    "maxTeamSize" INTEGER NOT NULL DEFAULT 1,
    "maxParticipantsPerContingent" INTEGER NOT NULL DEFAULT 0,
    "maxTotalParticipants" INTEGER NOT NULL DEFAULT 0,
    "venue" TEXT,
    "address" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "registrationStart" TIMESTAMP(3),
    "registrationEnd" TIMESTAMP(3),
    "judgingType" "JudgingType" NOT NULL DEFAULT 'PERCENTAGE',
    "status" "CompetitionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_target_groups" (
    "competitionId" TEXT NOT NULL,
    "targetGroupId" TEXT NOT NULL,

    CONSTRAINT "competition_target_groups_pkey" PRIMARY KEY ("competitionId","targetGroupId")
);

-- CreateTable
CREATE TABLE "judging_criteria" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "judging_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "competitions_code_key" ON "competitions"("code");

-- AddForeignKey
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_target_groups" ADD CONSTRAINT "competition_target_groups_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_target_groups" ADD CONSTRAINT "competition_target_groups_targetGroupId_fkey" FOREIGN KEY ("targetGroupId") REFERENCES "target_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judging_criteria" ADD CONSTRAINT "judging_criteria_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
