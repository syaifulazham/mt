-- Passcode links for third-party international registration (hand-scoped).
CREATE TABLE "international_links" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "routeSlug" TEXT NOT NULL,
    "passcode" TEXT NOT NULL,
    "label" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'ALL',
    "contingentIds" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "international_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "international_links_routeSlug_key" ON "international_links"("routeSlug");
CREATE INDEX "international_links_eventId_idx" ON "international_links"("eventId");
ALTER TABLE "international_links" ADD CONSTRAINT "international_links_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
