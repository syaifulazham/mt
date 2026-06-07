CREATE TABLE "galleries" (
  "id"          TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "year"        INTEGER NOT NULL,
  "description" TEXT,
  "coverUrl"    TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "galleries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gallery_photos" (
  "id"          TEXT NOT NULL,
  "galleryId"   TEXT NOT NULL,
  "driveFileId" TEXT NOT NULL,
  "thumbUrl"    TEXT NOT NULL,
  "fullUrl"     TEXT NOT NULL,
  "description" TEXT,
  "order"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gallery_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gallery_photos_galleryId_idx" ON "gallery_photos"("galleryId");

ALTER TABLE "gallery_photos"
  ADD CONSTRAINT "gallery_photos_galleryId_fkey"
  FOREIGN KEY ("galleryId") REFERENCES "galleries"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
