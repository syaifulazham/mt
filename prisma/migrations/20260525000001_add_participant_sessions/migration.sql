CREATE TABLE IF NOT EXISTS "participant_sessions" (
  "id"            TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "token"         TEXT NOT NULL,
  "expiresAt"     TIMESTAMP(3) NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "participant_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "participant_sessions_token_key" ON "participant_sessions"("token");
CREATE INDEX IF NOT EXISTS "participant_sessions_participantId_idx" ON "participant_sessions"("participantId");

ALTER TABLE "participant_sessions" ADD CONSTRAINT "participant_sessions_participantId_fkey"
  FOREIGN KEY ("participantId") REFERENCES "contestants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
