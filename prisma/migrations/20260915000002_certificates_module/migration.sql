-- CreateEnum
CREATE TYPE "CertTargetType" AS ENUM ('GENERAL', 'EVENT_PARTICIPANT', 'EVENT_WINNER', 'NON_CONTEST_PARTICIPANT', 'QUIZ_PARTICIPANT', 'QUIZ_WINNER', 'TRAINER', 'CONTINGENT', 'SCHOOL_WINNER');

-- CreateEnum
CREATE TYPE "CertTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CertAssetType" AS ENUM ('PDF', 'IMAGE');

-- CreateEnum
CREATE TYPE "CertStatus" AS ENUM ('DRAFT', 'LISTED', 'READY', 'REVOKED');

-- CreateEnum
CREATE TYPE "CertRecipientType" AS ENUM ('PARTICIPANT', 'TRAINER', 'CONTINGENT', 'MANAGER', 'OTHER');
-- CreateTable
CREATE TABLE "seasons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "serialPrefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cert_templates" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetType" "CertTargetType" NOT NULL,
    "status" "CertTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "draftConfig" JSONB NOT NULL,
    "baseAssetUrl" TEXT,
    "baseAssetType" "CertAssetType",
    "currentVersionId" TEXT,
    "competitionId" TEXT,
    "eventId" TEXT,
    "winnerRankFrom" INTEGER,
    "winnerRankTo" INTEGER,
    "prerequisites" JSONB,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cert_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cert_template_versions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "baseAssetUrl" TEXT NOT NULL,
    "baseAssetType" "CertAssetType" NOT NULL,
    "configuration" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT,

    CONSTRAINT "cert_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "uniqueCode" TEXT NOT NULL,
    "status" "CertStatus" NOT NULL DEFAULT 'READY',
    "issuedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientType" "CertRecipientType" NOT NULL,
    "recipientIc" TEXT,
    "recipientEmail" TEXT,
    "contingentName" TEXT,
    "schoolName" TEXT,
    "stateName" TEXT,
    "teamName" TEXT,
    "competitionName" TEXT,
    "competitionCode" TEXT,
    "eventName" TEXT,
    "awardTitle" TEXT,
    "rank" INTEGER,
    "meta" JSONB,
    "participantId" TEXT,
    "contingentId" TEXT,
    "teamId" TEXT,
    "eventId" TEXT,
    "competitionId" TEXT,
    "legacyCertId" INTEGER,
    "legacyParticipantId" INTEGER,
    "legacyContingentId" INTEGER,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cert_serial_counters" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "typeCode" VARCHAR(10) NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cert_serial_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seasons_code_key" ON "seasons"("code");

-- CreateIndex
CREATE INDEX "seasons_year_idx" ON "seasons"("year");

-- CreateIndex
CREATE UNIQUE INDEX "cert_templates_currentVersionId_key" ON "cert_templates"("currentVersionId");

-- CreateIndex
CREATE INDEX "cert_templates_seasonId_targetType_idx" ON "cert_templates"("seasonId", "targetType");

-- CreateIndex
CREATE INDEX "cert_templates_status_idx" ON "cert_templates"("status");

-- CreateIndex
CREATE UNIQUE INDEX "cert_template_versions_templateId_version_key" ON "cert_template_versions"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_serialNumber_key" ON "certificates"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_uniqueCode_key" ON "certificates"("uniqueCode");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_legacyCertId_key" ON "certificates"("legacyCertId");

-- CreateIndex
CREATE INDEX "certificates_seasonId_status_idx" ON "certificates"("seasonId", "status");

-- CreateIndex
CREATE INDEX "certificates_participantId_idx" ON "certificates"("participantId");

-- CreateIndex
CREATE INDEX "certificates_contingentId_idx" ON "certificates"("contingentId");

-- CreateIndex
CREATE INDEX "certificates_recipientIc_idx" ON "certificates"("recipientIc");

-- CreateIndex
CREATE INDEX "certificates_recipientName_idx" ON "certificates"("recipientName");

-- CreateIndex
CREATE INDEX "certificates_templateVersionId_idx" ON "certificates"("templateVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "cert_serial_counters_seasonId_typeCode_key" ON "cert_serial_counters"("seasonId", "typeCode");
-- AddForeignKey
ALTER TABLE "cert_templates" ADD CONSTRAINT "cert_templates_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cert_templates" ADD CONSTRAINT "cert_templates_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "cert_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cert_template_versions" ADD CONSTRAINT "cert_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "cert_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "cert_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cert_serial_counters" ADD CONSTRAINT "cert_serial_counters_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactly one current season (Prisma cannot express a partial unique index)
CREATE UNIQUE INDEX "seasons_one_current_idx" ON "seasons"("isCurrent") WHERE "isCurrent";
