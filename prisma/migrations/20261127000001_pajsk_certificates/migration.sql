-- PAJSK (Beta): one co-curricular marks certificate per participant per
-- competition code per season, derived from issued certificates.
-- Hand-scoped: only this table, its indexes and its single FK (to seasons —
-- same archival contract as "certificates"; participantId is opaque).
CREATE TABLE "pajsk_certificates" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "participantId" TEXT NOT NULL,
    "competitionCode" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "schoolName" TEXT,
    "stateName" TEXT,
    "competitionName" TEXT,
    "stage" TEXT NOT NULL,
    "placing" INTEGER,
    "placingStage" TEXT,
    "pelibatanMarks" INTEGER NOT NULL,
    "pencapaianMarks" INTEGER,
    "rulesYear" INTEGER NOT NULL,
    "sourceCertIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pajsk_certificates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pajsk_certificates_code_key" ON "pajsk_certificates"("code");
CREATE INDEX "pajsk_certificates_participantId_idx" ON "pajsk_certificates"("participantId");
CREATE UNIQUE INDEX "pajsk_certificates_seasonId_participantId_competitionCode_key" ON "pajsk_certificates"("seasonId", "participantId", "competitionCode");

ALTER TABLE "pajsk_certificates" ADD CONSTRAINT "pajsk_certificates_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
