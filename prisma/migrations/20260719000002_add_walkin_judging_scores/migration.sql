-- CreateTable
CREATE TABLE "walkin_judging_scores" (
    "id" TEXT NOT NULL,
    "walkInJudgingEndpointId" TEXT NOT NULL,
    "walkInRegistrationId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "timeSeconds" INTEGER,
    "optionIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "walkin_judging_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "walkin_judging_scores_walkInJudgingEndpointId_walkInRegistrationId_criterionId_key"
  ON "walkin_judging_scores"("walkInJudgingEndpointId", "walkInRegistrationId", "criterionId");

-- CreateIndex
CREATE INDEX "walkin_judging_scores_walkInJudgingEndpointId_idx" ON "walkin_judging_scores"("walkInJudgingEndpointId");

-- AddForeignKey
ALTER TABLE "walkin_judging_scores" ADD CONSTRAINT "walkin_judging_scores_walkInJudgingEndpointId_fkey"
  FOREIGN KEY ("walkInJudgingEndpointId") REFERENCES "walkin_judging_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walkin_judging_scores" ADD CONSTRAINT "walkin_judging_scores_walkInRegistrationId_fkey"
  FOREIGN KEY ("walkInRegistrationId") REFERENCES "walkin_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walkin_judging_scores" ADD CONSTRAINT "walkin_judging_scores_criterionId_fkey"
  FOREIGN KEY ("criterionId") REFERENCES "judging_criterions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
