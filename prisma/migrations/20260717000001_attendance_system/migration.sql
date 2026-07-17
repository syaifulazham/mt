-- Add attendedAt to team_events
ALTER TABLE "team_events" ADD COLUMN "attendedAt" TIMESTAMP(3);

-- Create attendance_endpoints table
CREATE TABLE "attendance_endpoints" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "routeCode" TEXT NOT NULL,
    "passcode" TEXT NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_endpoints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_endpoints_routeCode_key" ON "attendance_endpoints"("routeCode");
CREATE INDEX "attendance_endpoints_eventId_idx" ON "attendance_endpoints"("eventId");

ALTER TABLE "attendance_endpoints" ADD CONSTRAINT "attendance_endpoints_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
