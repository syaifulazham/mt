-- CreateTable
CREATE TABLE "medal_tally_endpoints" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "routeSlug" TEXT NOT NULL,
    "passcode" TEXT,
    "label" TEXT,
    "status" "ResultsEndpointStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "medal_tally_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "medal_tally_endpoints_routeSlug_key" ON "medal_tally_endpoints"("routeSlug");
CREATE INDEX "medal_tally_endpoints_eventId_idx" ON "medal_tally_endpoints"("eventId");

-- AddForeignKey
ALTER TABLE "medal_tally_endpoints" ADD CONSTRAINT "medal_tally_endpoints_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
