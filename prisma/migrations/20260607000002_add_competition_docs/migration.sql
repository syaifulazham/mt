CREATE TABLE "competition_docs" (
  "id"            TEXT        NOT NULL PRIMARY KEY,
  "competitionId" TEXT        NOT NULL,
  "name"          TEXT        NOT NULL,
  "url"           TEXT        NOT NULL,
  "key"           TEXT        NOT NULL,
  "size"          INTEGER,
  "uploadedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "competition_docs_competitionId_fkey"
    FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "competition_docs_competitionId_idx" ON "competition_docs"("competitionId");
