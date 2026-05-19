-- CreateEnum
CREATE TYPE "OrganizerRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'PARTICIPANTS_MANAGER', 'JUDGE_COORDINATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "IdType" AS ENUM ('IC', 'PASSPORT');

-- CreateEnum
CREATE TYPE "InstitutionType" AS ENUM ('SCHOOL', 'HIGHER', 'INDEPENDENT', 'INTERNATIONAL');

-- CreateEnum
CREATE TYPE "SchoolLevel" AS ENUM ('PRIMARY', 'SECONDARY', 'SPECIAL');

-- CreateEnum
CREATE TYPE "SchoolCategory" AS ENUM ('KEBANGSAAN', 'KEBANGSAAN_CINA', 'KEBANGSAAN_TAMIL', 'AGAMA', 'TEKNIK', 'SPORT', 'PRIVATE', 'LAIN_LAIN');

-- CreateEnum
CREATE TYPE "ContingentType" AS ENUM ('SCHOOL', 'HIGHER', 'INDEPENDENT', 'INTERNATIONAL');

-- CreateEnum
CREATE TYPE "ContingentStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ContingentManagerRole" AS ENUM ('OWNER', 'MANAGER');

-- CreateTable
CREATE TABLE "organizer_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "OrganizerRole" NOT NULL DEFAULT 'VIEWER',
    "totpSecretEnc" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "forcePasswordChange" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "inviteToken" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "organizer_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizer_sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizer_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,

    CONSTRAINT "organizer_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_profiles" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "idType" "IdType",
    "idNumber" TEXT,
    "nationality" TEXT,
    "institutionType" "InstitutionType",
    "schoolId" TEXT,
    "higherInstitutionId" TEXT,
    "countryId" TEXT,
    "profileComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "manager_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "codeIso2" CHAR(2) NOT NULL,
    "codeIso3" CHAR(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "states" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,

    CONSTRAINT "states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ppdCode" TEXT,
    "stateId" TEXT NOT NULL,
    "zoneId" TEXT,
    "districtId" TEXT,
    "level" "SchoolLevel" NOT NULL,
    "category" "SchoolCategory" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "higher_institutions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "stateId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "higher_institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contingents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contingentType" "ContingentType" NOT NULL,
    "schoolId" TEXT,
    "higherInstitutionId" TEXT,
    "countryInvitationId" TEXT,
    "stateId" TEXT,
    "zoneId" TEXT,
    "countryId" TEXT,
    "status" "ContingentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contingents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contingent_managers" (
    "id" TEXT NOT NULL,
    "contingentId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "role" "ContingentManagerRole" NOT NULL DEFAULT 'MANAGER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contingent_managers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "stateId" TEXT,
    "zoneId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizer_users_email_key" ON "organizer_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizer_users_inviteToken_key" ON "organizer_users"("inviteToken");

-- CreateIndex
CREATE UNIQUE INDEX "organizer_sessions_sessionToken_key" ON "organizer_sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "organizer_accounts_provider_providerAccountId_key" ON "organizer_accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "manager_profiles_clerkUserId_key" ON "manager_profiles"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "manager_profiles_email_key" ON "manager_profiles"("email");

-- CreateIndex
CREATE UNIQUE INDEX "countries_codeIso2_key" ON "countries"("codeIso2");

-- CreateIndex
CREATE UNIQUE INDEX "countries_codeIso3_key" ON "countries"("codeIso3");

-- CreateIndex
CREATE UNIQUE INDEX "states_code_key" ON "states"("code");

-- CreateIndex
CREATE UNIQUE INDEX "schools_code_key" ON "schools"("code");

-- CreateIndex
CREATE UNIQUE INDEX "higher_institutions_code_key" ON "higher_institutions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "contingent_managers_contingentId_managerId_key" ON "contingent_managers"("contingentId", "managerId");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- AddForeignKey
ALTER TABLE "organizer_sessions" ADD CONSTRAINT "organizer_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "organizer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_accounts" ADD CONSTRAINT "organizer_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "organizer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_profiles" ADD CONSTRAINT "manager_profiles_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_profiles" ADD CONSTRAINT "manager_profiles_higherInstitutionId_fkey" FOREIGN KEY ("higherInstitutionId") REFERENCES "higher_institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_profiles" ADD CONSTRAINT "manager_profiles_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "states" ADD CONSTRAINT "states_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "higher_institutions" ADD CONSTRAINT "higher_institutions_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contingents" ADD CONSTRAINT "contingents_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contingents" ADD CONSTRAINT "contingents_higherInstitutionId_fkey" FOREIGN KEY ("higherInstitutionId") REFERENCES "higher_institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contingents" ADD CONSTRAINT "contingents_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contingents" ADD CONSTRAINT "contingents_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contingents" ADD CONSTRAINT "contingents_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contingent_managers" ADD CONSTRAINT "contingent_managers_contingentId_fkey" FOREIGN KEY ("contingentId") REFERENCES "contingents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contingent_managers" ADD CONSTRAINT "contingent_managers_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "manager_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
