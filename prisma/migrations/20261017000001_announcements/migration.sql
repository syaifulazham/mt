-- Announcer boards (/announce/[routeSlug]) for MCs: passcode-protected lists of
-- the event's competitions whose judging is VERIFIED, plus event-wide marks of
-- which competitions have been announced.
CREATE TABLE "announcement_endpoints" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "routeSlug" TEXT NOT NULL,
    "passcode" TEXT NOT NULL,
    "label" TEXT,
    "status" "ResultsEndpointStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcement_endpoints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "announcement_endpoints_routeSlug_key" ON "announcement_endpoints"("routeSlug");
CREATE INDEX "announcement_endpoints_eventId_idx" ON "announcement_endpoints"("eventId");
ALTER TABLE "announcement_endpoints" ADD CONSTRAINT "announcement_endpoints_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "announcement_marks" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "announcedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "announcedBy" TEXT,

    CONSTRAINT "announcement_marks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "announcement_marks_eventId_kind_refId_key" ON "announcement_marks"("eventId", "kind", "refId");
ALTER TABLE "announcement_marks" ADD CONSTRAINT "announcement_marks_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
