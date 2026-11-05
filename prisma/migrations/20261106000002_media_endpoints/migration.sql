-- Media endpoints: passcode-protected pages (/media/<slug>) for an event's
-- media team to create galleries and upload photos. Hand-scoped to these objects.

CREATE TABLE "media_endpoints" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "routeSlug" TEXT NOT NULL,
    "passcode" TEXT NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_endpoints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "media_endpoints_routeSlug_key" ON "media_endpoints"("routeSlug");
CREATE INDEX "media_endpoints_eventId_idx" ON "media_endpoints"("eventId");

ALTER TABLE "media_endpoints" ADD CONSTRAINT "media_endpoints_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Galleries created through a media endpoint.
ALTER TABLE "galleries" ADD COLUMN "mediaEndpointId" TEXT;
CREATE INDEX "galleries_mediaEndpointId_idx" ON "galleries"("mediaEndpointId");
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_mediaEndpointId_fkey"
  FOREIGN KEY ("mediaEndpointId") REFERENCES "media_endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;
