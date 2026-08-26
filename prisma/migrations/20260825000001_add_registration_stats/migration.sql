-- CreateTable
CREATE TABLE "registration_stats" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "competitionCode" TEXT NOT NULL,
    "contestantId" TEXT NOT NULL,
    "gender" TEXT,
    "age" INTEGER,
    "classGrade" TEXT,
    "ethnic" TEXT,
    "contingentId" TEXT,
    "contingent" TEXT,
    "contingentType" TEXT,
    "zone" TEXT,
    "state" TEXT,
    "ppd" TEXT,
    "schoolCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registration_stats_competitionId_contestantId_key" ON "registration_stats"("competitionId", "contestantId");

-- CreateIndex
CREATE INDEX "registration_stats_competitionId_idx" ON "registration_stats"("competitionId");

-- CreateIndex
CREATE INDEX "registration_stats_batchId_idx" ON "registration_stats"("batchId");
