-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "EduLevel" AS ENUM ('PRIMARY', 'SECONDARY', 'YOUTH');

-- CreateTable
CREATE TABLE "contestants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ic" TEXT,
    "email" TEXT,
    "phoneNumber" TEXT,
    "gender" "Gender" NOT NULL,
    "age" INTEGER,
    "eduLevel" "EduLevel" NOT NULL,
    "classGrade" TEXT,
    "className" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "contingentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contestants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contestants_contingentId_idx" ON "contestants"("contingentId");

-- AddForeignKey
ALTER TABLE "contestants" ADD CONSTRAINT "contestants_contingentId_fkey" FOREIGN KEY ("contingentId") REFERENCES "contingents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
