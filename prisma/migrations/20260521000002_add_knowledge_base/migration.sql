CREATE TABLE IF NOT EXISTS "knowledge_base" (
    "id"         TEXT        NOT NULL,
    "path"       TEXT        NOT NULL,
    "title"      TEXT        NOT NULL,
    "content"    TEXT        NOT NULL,
    "entityType" TEXT,
    "entityId"   TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_base_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_base_path_key" ON "knowledge_base"("path");
CREATE INDEX IF NOT EXISTS "knowledge_base_entityType_entityId_idx" ON "knowledge_base"("entityType", "entityId");
