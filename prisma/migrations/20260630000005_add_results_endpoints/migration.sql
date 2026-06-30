-- CreateEnum
CREATE TYPE "ResultsEndpointStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateTable
CREATE TABLE "results_endpoints" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "routeSlug" TEXT NOT NULL,
    "passcode" TEXT,
    "label" TEXT,
    "status" "ResultsEndpointStatus" NOT NULL DEFAULT 'ACTIVE',
    "competitionIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "results_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "results_endpoints_routeSlug_key" ON "results_endpoints"("routeSlug");
CREATE INDEX "results_endpoints_eventId_idx" ON "results_endpoints"("eventId");

-- AddForeignKey
ALTER TABLE "results_endpoints" ADD CONSTRAINT "results_endpoints_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
