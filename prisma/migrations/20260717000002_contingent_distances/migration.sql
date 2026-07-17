CREATE TABLE "contingent_distances" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "contingentId" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "stateName" TEXT NOT NULL,
    "districtName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "roadKm" DOUBLE PRECISION,
    "airKm" DOUBLE PRECISION,
    "waterKm" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contingent_distances_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "contingent_distances_eventId_contingentId_key"
    ON "contingent_distances"("eventId", "contingentId");
