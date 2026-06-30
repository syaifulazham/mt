-- CreateTable
CREATE TABLE "judging_scores" (
    "id" TEXT NOT NULL,
    "judgingTaskId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "timeSeconds" INTEGER,
    "optionIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "judging_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "judging_scores_judgingTaskId_idx" ON "judging_scores"("judgingTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "judging_scores_judgingTaskId_teamId_criterionId_key" ON "judging_scores"("judgingTaskId", "teamId", "criterionId");

-- AddForeignKey
ALTER TABLE "judging_scores" ADD CONSTRAINT "judging_scores_judgingTaskId_fkey" FOREIGN KEY ("judgingTaskId") REFERENCES "judging_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judging_scores" ADD CONSTRAINT "judging_scores_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judging_scores" ADD CONSTRAINT "judging_scores_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "judging_criterions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
