-- Certificates → Generator jobs.
CREATE TABLE "cert_generator_jobs" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "total" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "cert_generator_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cert_generator_jobs_templateId_idx" ON "cert_generator_jobs"("templateId");

-- Fast "already issued for this template?" checks when a job re-runs.
CREATE INDEX "certificates_meta_genKey_idx" ON "certificates" ((meta->>'genKey'));
