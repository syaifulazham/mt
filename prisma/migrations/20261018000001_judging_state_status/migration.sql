-- Per-state judging: each state of a competition has its own OPEN → COMPLETED
-- → VERIFIED lifecycle (the competition-level fields stay the national "Semua"
-- row), and judges can announce their task complete for one state.
CREATE TABLE "judging_state_statuses" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "judgingStatus" TEXT NOT NULL DEFAULT 'OPEN',
    "judgingCompletedAt" TIMESTAMP(3),
    "judgingCompletedBy" TEXT,
    "judgingVerifiedAt" TIMESTAMP(3),
    "judgingVerifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "judging_state_statuses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "judging_state_statuses_scope_refId_stateId_key" ON "judging_state_statuses"("scope", "refId", "stateId");
CREATE INDEX "judging_state_statuses_scope_refId_idx" ON "judging_state_statuses"("scope", "refId");

CREATE TABLE "judging_task_state_completions" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "judging_task_state_completions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "judging_task_state_completions_scope_taskId_stateId_key" ON "judging_task_state_completions"("scope", "taskId", "stateId");
CREATE INDEX "judging_task_state_completions_scope_taskId_idx" ON "judging_task_state_completions"("scope", "taskId");

-- Announcement marks per state ("" = national results).
ALTER TABLE "announcement_marks" ADD COLUMN "stateId" TEXT NOT NULL DEFAULT '';
DROP INDEX "announcement_marks_eventId_kind_refId_key";
CREATE UNIQUE INDEX "announcement_marks_eventId_kind_refId_stateId_key" ON "announcement_marks"("eventId", "kind", "refId", "stateId");
